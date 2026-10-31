const $ = s => document.querySelector(s);
let products = [], cart = JSON.parse(localStorage.getItem("bh_cart") || "[]");
const money = n => "৳" + Number(n).toLocaleString("en-US");
const icons = {"টি-শার্ট":"👕","প্যান্ট":"👖","শীতের পোশাক":"🧥","ঘড়ি":"⌚"};
function save(){localStorage.setItem("bh_cart",JSON.stringify(cart));$("#cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0)}
function toast(msg){$("#toast").textContent=msg;$("#toast").classList.remove("hidden");setTimeout(()=>$("#toast").classList.add("hidden"),3000)}
async function loadProducts(){try{products=await (await fetch("/api/products")).json();render()}catch{ $("#productGrid").textContent="পণ্য লোড করা যায়নি। সার্ভার চালু আছে কি না দেখুন।"}}
function render(){const q=$("#search").value.trim().toLowerCase(),cat=$("#category").value;const list=products.filter(p=>(!cat||p.category===cat)&&(`${p.name} ${p.description}`).toLowerCase().includes(q));$("#productGrid").innerHTML=list.map(p=>`<article class="product"><div class="productPic">${p.image?`<img src="${p.image}" alt="">`:icons[p.category]||"🛍️"}</div><div class="productInfo"><small>${p.category}</small><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description||"BAZAR HUB কালেকশন")}</p><div class="price">${money(p.price)}</div><div class="stock">স্টক: ${p.stock}</div><button ${p.stock<1?"disabled":""} onclick="add(${p.id})">${p.stock<1?"স্টক শেষ":"কার্টে যোগ করুন"}</button></div></article>`).join("")||"<p>কোনো পণ্য পাওয়া যায়নি।</p>"}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
window.add = id => {const p=products.find(x=>x.id===id);if(!p)return;const old=cart.find(x=>x.id===id);if(old){if(old.qty>=p.stock)return toast("স্টক যথেষ্ট নেই।");old.qty++}else cart.push({id,qty:1,size:p.sizes[0]||"",color:p.colors[0]||""});save();toast("কার্টে যোগ হয়েছে।")}
function showCart(){const box=$("#cartItems");box.innerHTML=cart.map(x=>{const p=products.find(p=>p.id===x.id);return p?`<div class="cartLine"><span>${escapeHtml(p.name)}<br><small>${money(p.price)} × ${x.qty}</small></span><span><button onclick="qty(${x.id},-1)">−</button> ${x.qty} <button onclick="qty(${x.id},1)">+</button></span></div>`:""}).join("")||"কার্ট খালি";const sub=cart.reduce((s,x)=>s+(products.find(p=>p.id===x.id)?.price||0)*x.qty,0);$("#cartTotal").textContent=`পণ্যের দাম: ${money(sub)} | ডেলিভারি: ${sub>=2000? "ফ্রি":money(80)} | মোট: ${money(sub+(sub>=2000?0:80))}`;$("#cartModal").classList.remove("hidden")}
window.qty=(id,d)=>{const x=cart.find(x=>x.id===id);if(x)x.qty+=d;cart=cart.filter(x=>x.qty>0);save();showCart()}
$("#cartOpen").onclick=showCart;document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).classList.add("hidden"));
$("#checkoutOpen").onclick=()=>{if(!cart.length)return toast("কার্ট খালি।");$("#cartModal").classList.add("hidden");const sub=cart.reduce((s,x)=>s+(products.find(p=>p.id===x.id)?.price||0)*x.qty,0);$("#checkoutSummary").textContent=`মোট বিল: ${money(sub+(sub>=2000?0:80))} (ডেলিভারি ${sub>=2000?"ফ্রি":money(80)})`;$("#checkoutModal").classList.remove("hidden")}
$("#paymentMethod").onchange=e=>{$("#bkashBox").classList.toggle("hidden",e.target.value!=="BKASH");$("#transactionId").required=e.target.value==="BKASH"}
$("#checkoutForm").onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const payload={
    name:f.get("name"),
    phone:f.get("phone"),
    address:f.get("address"),
    paymentMethod:f.get("paymentMethod"),
    transactionId:f.get("transactionId"),
    items:cart
  };

  try{
    const r=await fetch("/api/orders",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });

    const data=await r.json();
    if(!r.ok) throw Error(data.error||"অর্ডার করা যায়নি");

    localStorage.setItem("bh_customer_order",JSON.stringify({
      orderCode:data.orderCode,
      phone:payload.phone
    }));

    cart=[];
    save();
    $("#checkoutModal").classList.add("hidden");
    e.target.reset();
    $("#bkashBox").classList.add("hidden");

    alert(`${data.message}\nঅর্ডার নম্বর: ${data.orderCode}\nমোট: ${money(data.total)}\nঅর্ডার নম্বরটি সংরক্ষণ করুন।`);

    await loadProducts();
  }catch(err){
    toast(err.message);
  }
};
async function checkOrderConfirmation(){
  const saved = JSON.parse(
    localStorage.getItem("bh_customer_order") || "null"
  );

  if(!saved) return;

  try{
    const r = await fetch("/api/order-track",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        orderCode:saved.orderCode,
        phone:saved.phone
      })
    });

    if(!r.ok) return;

    const data = await r.json();

    if(
      data.orderStatus === "CONFIRMED" &&
      localStorage.getItem("bh_confirmed_notice") !== saved.orderCode
    ){
      localStorage.setItem("bh_confirmed_notice",saved.orderCode);

      alert("🎉 অভিনন্দন!\nআপনার BAZAR HUB অর্ডার কনফার্ম হয়েছে!");
    }

  }catch(err){
    console.log("Order status check failed");
  }
}

checkOrderConfirmation();
setInterval(checkOrderConfirmation,30000);
$("#searchForm").onsubmit=e=>{e.preventDefault();render()};$("#search").oninput=render;$("#category").onchange=render;$("#year").textContent=new Date().getFullYear();save();loadProducts();
