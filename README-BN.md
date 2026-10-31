# BAZAR HUB — সেটআপ নির্দেশিকা

## কী আছে
- React ছাড়াই হালকা, মোবাইল-ফ্রেন্ডলি storefront
- Node.js + Express backend
- SQLite database (পণ্য, অর্ডার ও admin session)
- নিরাপদ admin login (bcrypt password hash + httpOnly session cookie)
- পণ্য যোগ, ছবি আপলোড, দাম/স্টক পরিবর্তন
- অর্ডার পরিচালনা ও manual bKash payment verification
- bKash Personal নম্বর: `01633046064`
- COD ও bKash manual Send Money

## Android/Termux বা কম্পিউটারে চালানো
Node.js 20 বা তার নতুন সংস্করণ লাগবে। প্রজেক্ট ফোল্ডারে:

1. `.env.example` কপি করে `.env` নাম দিন।
2. `.env`-এ `ADMIN_PASSWORD` বদলে অন্তত 12 অক্ষরের শক্তিশালী পাসওয়ার্ড দিন।
3. `SESSION_SECRET`-এ দীর্ঘ, এলোমেলো গোপন string দিন (কমপক্ষে 32 অক্ষর)।
4. চালান:
   ```bash
   npm install
   npm start
   ```
5. ব্রাউজারে খুলুন: `http://localhost:3000`
6. Admin: `http://localhost:3000/admin`

## Manual bKash flow
- Checkout-এ bKash বেছে নিলে 01633046064 নম্বরে Send Money করার নির্দেশ দেখায়।
- কাস্টমার Transaction ID জমা দেয়।
- অর্ডার `VERIFY_REQUIRED` থাকে; নিজে bKash অ্যাপে লেনদেন যাচাই না করা পর্যন্ত Admin থেকে `PAID` করবেন না।
- শুধু Transaction ID দেখে টাকা এসেছে ধরে নেবেন না। bKash অ্যাপে প্রাপ্ত টাকা ও পরিমাণ যাচাই করুন।
- এটি Merchant API/automatic payment নয়।

## Production-এ প্রকাশের আগে
- HTTPS বাধ্যতামূলক; hosting-এ `NODE_ENV=production` দিন।
- `.env`-এর secret ও admin password শক্তিশালী ও গোপন রাখুন।
- `data/` এবং `uploads/`-এর persistent disk/backup নিশ্চিত করুন।
- SQLite একক সার্ভার/কম-মাঝারি ট্রাফিকের জন্য। একাধিক server instance চালালে managed PostgreSQL-এ migrate করুন।
- এই starter-এ guest checkout আছে; customer account/login এখনো অন্তর্ভুক্ত নয়।
- রিটার্ন, রিফান্ড, ডেলিভারি চার্জ ও কাস্টমার সাপোর্টের নীতি ব্যবসার বাস্তব নিয়ম অনুযায়ী প্রকাশ করুন।
- Production launch-এর আগে security review, backup/restore test, privacy notice ও স্থানীয় আইন/কর সংক্রান্ত যাচাই করুন।

## ডিফল্ট পণ্য
প্রথমবার চালালে চারটি ক্যাটাগরির একটি করে নমুনা পণ্য তৈরি হবে। Admin থেকে এগুলো পরিবর্তন বা নতুন পণ্য যোগ করা যাবে।
