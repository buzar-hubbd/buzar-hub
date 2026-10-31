require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.resolve(process.env.DATABASE_FILE || "./data/bazar-hub.sqlite");
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
  console.error("Set ADMIN_PASSWORD to a strong password of at least 12 characters in .env");
  process.exit(1);
}

const db = new Database(DATA_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('টি-শার্ট','প্যান্ট','শীতের পোশাক','ঘড়ি')),
 description TEXT NOT NULL DEFAULT '',
 price INTEGER NOT NULL CHECK(price >= 0),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
 sizes TEXT NOT NULL DEFAULT '[]',
 colors TEXT NOT NULL DEFAULT '[]',
 image TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_code TEXT NOT NULL UNIQUE,
 customer_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 address TEXT NOT NULL,
 items_json TEXT NOT NULL,
 subtotal INTEGER NOT NULL,
 delivery_fee INTEGER NOT NULL DEFAULT 0,
 total INTEGER NOT NULL,
 payment_method TEXT NOT NULL,
 payment_number TEXT NOT NULL,
 transaction_id TEXT UNIQUE,
 payment_status TEXT NOT NULL DEFAULT 'PENDING',
 order_status TEXT NOT NULL DEFAULT 'PENDING',
 admin_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
const adminName = process.env.ADMIN_USERNAME || "admin";
const existingAdmin = db.prepare("SELECT id FROM admins WHERE username=?").get(adminName);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)").run(adminName, hash);
}

const categories = ["টি-শার্ট", "প্যান্ট", "শীতের পোশাক", "ঘড়ি"];
const seedCount = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (!seedCount) {
  const seed = [
    ["BAZAR HUB Logo টি-শার্ট","টি-শার্ট","নিজস্ব BAZAR HUB ব্র্যান্ডিংসহ আরামদায়ক টি-শার্ট।",499,30,'["S","M","L","XL","XXL"]','["কালো","সাদা"]',"",1],
    ["BAZAR HUB Cargo প্যান্ট","প্যান্ট","দৈনন্দিন ব্যবহারের জন্য স্টাইলিশ কার্গো প্যান্ট।",899,20,'["M","L","XL","XXL"]','["কালো","খাকি"]',"",1],
    ["BAZAR HUB Hoodie","শীতের পোশাক","নিজস্ব ব্র্যান্ডিংসহ উষ্ণ হুডি।",1099,20,'["M","L","XL","XXL"]','["কালো","ধূসর"]',"",1],
    ["Classic Wrist Watch","ঘড়ি","স্মার্ট ও ক্লাসিক ডিজাইনের হাতঘড়ি।",1899,12,'["One Size"]','["কালো"]',"",1]
  ];
  const insert = db.prepare("INSERT INTO products(name,category,description,price,stock,sizes,colors,image,active) VALUES(?,?,?,?,?,?,?,?,?)");
  const tx = db.transaction(rows => rows.forEach(row => insert.run(...row)));
  tx(seed);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: path.dirname(DATA_FILE) }),
  name: "bazarhub.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use("/api/admin/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,10)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!["image/jpeg","image/png","image/webp"].includes(file.mimetype)) return cb(new Error("শুধু JPG, PNG বা WEBP ছবি আপলোড করা যাবে।"));
    cb(null, true);
  }
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "প্রথমে Admin Login করুন।" });
  next();
}
function cleanText(value, max=500) {
  return String(value ?? "").trim().slice(0, max);
}
function publicProduct(p) {
  return { ...p, sizes: JSON.parse(p.sizes || "[]"), colors: JSON.parse(p.colors || "[]") };
}

app.get("/api/config", (_, res) => res.json({
  shopName: process.env.SHOP_NAME || "BAZAR HUB",
  bkashNumber: process.env.BKASH_PERSONAL_NUMBER || "01633046064",
  categories
}));
app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY created_at DESC,id DESC").all();
  res.json(rows.map(publicProduct));
});
app.get("/api/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "পণ্য পাওয়া যায়নি।" });
  res.json(publicProduct(p));
});

app.post("/api/orders", rateLimit({ windowMs: 10 * 60 * 1000, limit: 15 }), (req, res) => {
  const name = cleanText(req.body.name, 100);
  const phone = cleanText(req.body.phone, 20);
  const address = cleanText(req.body.address, 500);
  const payment = req.body.paymentMethod === "BKASH" ? "BKASH" : "COD";
  const transactionId = payment === "BKASH" ? cleanText(req.body.transactionId, 80) : null;
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!name || !/^01[3-9]\d{8}$/.test(phone) || !address || !rawItems.length) {
    return res.status(400).json({ error: "নাম, সঠিক ১১ সংখ্যার বাংলাদেশি ফোন, ঠিকানা ও পণ্য দিন।" });
  }
  if (payment === "BKASH" && (!transactionId || transactionId.length < 5)) {
    return res.status(400).json({ error: "bKash Transaction ID দিন।" });
  }
  if (payment === "BKASH" && db.prepare("SELECT id FROM orders WHERE transaction_id=?").get(transactionId)) {
    return res.status(409).json({ error: "এই Transaction ID আগে ব্যবহার করা হয়েছে।" });
  }
  const items = [];
  let subtotal = 0;
  for (const item of rawItems.slice(0, 30)) {
    const product = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(item.id));
    const qty = Math.max(0, Math.min(20, Number.parseInt(item.qty, 10) || 0));
    if (!product || qty < 1 || qty > product.stock) return res.status(400).json({ error: "একটি পণ্যের স্টক যথেষ্ট নেই। কার্ট আপডেট করুন।" });
    const size = cleanText(item.size, 20);
    const color = cleanText(item.color, 30);
    if (product.sizes !== "[]" && size && !JSON.parse(product.sizes).includes(size)) return res.status(400).json({ error: "পণ্যের সাইজ সঠিক নয়।" });
    if (product.colors !== "[]" && color && !JSON.parse(product.colors).includes(color)) return res.status(400).json({ error: "পণ্যের কালার সঠিক নয়।" });
    items.push({ id: product.id, name: product.name, price: product.price, qty, size, color });
    subtotal += product.price * qty;
  }
  const deliveryFee = subtotal >= 2000 ? 0 : 80;
  const total = subtotal + deliveryFee;
  const orderCode = "BH" + Date.now().toString().slice(-9) + Math.floor(Math.random()*90+10);
  const insertOrder = db.prepare(`INSERT INTO orders
    (order_code,customer_name,phone,address,items_json,subtotal,delivery_fee,total,payment_method,payment_number,transaction_id,payment_status,order_status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const reduceStock = db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?");
  const create = db.transaction(() => {
    const result = insertOrder.run(orderCode,name,phone,address,JSON.stringify(items),subtotal,deliveryFee,total,payment,process.env.BKASH_PERSONAL_NUMBER || "01633046064",transactionId,payment==="BKASH"?"VERIFY_REQUIRED":"UNPAID","PENDING");
    for (const item of items) {
      const update = reduceStock.run(item.qty,item.id,item.qty);
      if (!update.changes) throw new Error("স্টক পরিবর্তিত হয়েছে। আবার অর্ডার করুন।");
    }
    return result.lastInsertRowid;
  });
  try {
    create();
    res.status(201).json({
      message: payment==="BKASH" ? "অর্ডার জমা হয়েছে। bKash পেমেন্ট অ্যাডমিন যাচাই করবেন।" : "অর্ডার জমা হয়েছে।",
      orderCode, total, paymentStatus: payment==="BKASH" ? "VERIFY_REQUIRED" : "UNPAID"
    });
  } catch (e) {
    res.status(400).json({ error: e.message || "অর্ডার তৈরি করা যায়নি।" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  const username = cleanText(req.body.username, 80);
  const password = String(req.body.password || "");
  const admin = db.prepare("SELECT * FROM admins WHERE username=?").get(username);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) return res.status(401).json({ error: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।" });
  req.session.adminId = admin.id;
  req.session.adminName = admin.username;
  res.json({ message: "লগইন সফল।", username: admin.username });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => req.session.destroy(() => res.json({ message: "লগআউট হয়েছে।" })));
app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ username: req.session.adminName }));
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all();
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items_json) })));
});
app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: "অর্ডার পাওয়া যায়নি।" });
  const paymentStatus = ["PENDING","VERIFY_REQUIRED","PAID","REJECTED","UNPAID"].includes(req.body.paymentStatus) ? req.body.paymentStatus : order.payment_status;
  const orderStatus = ["PENDING","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED"].includes(req.body.orderStatus) ? req.body.orderStatus : order.order_status;
  const note = cleanText(req.body.adminNote, 500);
  db.prepare("UPDATE orders SET payment_status=?,order_status=?,admin_note=? WHERE id=?").run(paymentStatus,orderStatus,note,order.id);
  res.json({ message: "অর্ডার আপডেট হয়েছে।" });
});
app.post("/api/admin/products", requireAdmin, upload.single("image"), (req, res) => {
  const { name,category,description,price,stock,sizes,colors } = req.body;
  if (!cleanText(name,120) || !categories.includes(category) || !Number.isInteger(Number(price)) || Number(price)<0 || !Number.isInteger(Number(stock)) || Number(stock)<0) {
    return res.status(400).json({ error: "পণ্যের তথ্য সঠিকভাবে দিন।" });
  }
  const image = req.file ? `/uploads/${req.file.filename}` : "";
  const result = db.prepare("INSERT INTO products(name,category,description,price,stock,sizes,colors,image,active) VALUES(?,?,?,?,?,?,?,?,1)")
    .run(cleanText(name,120),category,cleanText(description,1000),Number(price),Number(stock),JSON.stringify(cleanText(sizes,150).split(",").map(x=>x.trim()).filter(Boolean)),JSON.stringify(cleanText(colors,150).split(",").map(x=>x.trim()).filter(Boolean)),image);
  res.status(201).json({ id: result.lastInsertRowid, message: "পণ্য যোগ হয়েছে।" });
});
app.patch("/api/admin/products/:id", requireAdmin, (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id=?").get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "পণ্য পাওয়া যায়নি।" });
  const name = cleanText(req.body.name ?? p.name,120);
  const category = categories.includes(req.body.category) ? req.body.category : p.category;
  const price = Number.isInteger(Number(req.body.price)) ? Number(req.body.price) : p.price;
  const stock = Number.isInteger(Number(req.body.stock)) ? Number(req.body.stock) : p.stock;
  const active = req.body.active === false ? 0 : 1;
  db.prepare("UPDATE products SET name=?,category=?,description=?,price=?,stock=?,active=? WHERE id=?")
    .run(name,category,cleanText(req.body.description ?? p.description,1000),price,stock,active,p.id);
  res.json({ message: "পণ্য আপডেট হয়েছে।" });
});
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(Number(req.params.id));
  res.json({ message: "পণ্য স্টোর থেকে সরানো হয়েছে।" });
});
app.get("/api/admin/products", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all().map(publicProduct));
});

app.get("/admin", (_, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route পাওয়া যায়নি।" });
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "অনুরোধ সম্পন্ন করা যায়নি।" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`BAZAR HUB চলছে: http://localhost:${PORT}`));
