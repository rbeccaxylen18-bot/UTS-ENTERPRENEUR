/* SECOND IN — laman & database lokal untuk demo UTS. Tidak ada ulasan palsu. */
'use strict';
const $ = (id) => document.getElementById(id);
const state = { user:null, products:[], favorites:new Set(), category:'semua', q:'', conversation:null, cartItems:[], cartTotal:0 };
const paths = new Set(['/beranda','/jelajahi','/jual','/keranjang','/favorit','/pesan','/akun','/bantuan']);
const rupiah = (n) => 'Rp' + Number(n||0).toLocaleString('id-ID');
const esc = (s='') => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeImage = (src='') => /^(https?:\/\/|\/uploads\/[a-zA-Z0-9_-]+\.(?:jpe?g|png)$)/i.test(String(src)) ? esc(src) : '';
const picture = (p,cls='') => `<img class="${cls}" src="${safeImage(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`;
let toastTimer;
function toast(message){const x=$('toast');x.textContent=message;x.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove('show'),3300);}
async function api(path,options={}){
  const res=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let json;try{json=await res.json();}catch(e){throw Error('Server tidak merespons. Jalankan server.py dulu.');}
  if(!res.ok)throw Error(json.message||'Ada kendala, coba lagi.');return json;
}
const send=(path,method,body) => api(path,{method,body:JSON.stringify(body)});
async function uploadPhoto(file){
 if(!file || !file.size)throw Error('Pilih foto JPG atau PNG terlebih dahulu.');
 if(!/\.(jpe?g|png)$/i.test(file.name) || !['image/jpeg','image/png'].includes(file.type))throw Error('Hanya JPG, JPEG, atau PNG yang dapat diunggah.');
 if(file.size>5*1024*1024)throw Error('Ukuran foto maksimal 5 MB.');
 const body=new FormData();body.append('image',file);
 const response=await fetch('/api/upload-image',{method:'POST',body,credentials:'same-origin'});
 let data;try{data=await response.json();}catch(e){throw Error('Gagal membaca hasil upload dari server.');}
 if(!response.ok)throw Error(data.message||'Foto tidak berhasil diunggah.');
 return data.url;
}
async function requireLogin(){if(state.user)return true;toast('Masuk dulu, ya.');navigate('/akun');return false;}
function navActive(page){
 document.querySelectorAll('.nav-center a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='/'+page));
 document.querySelectorAll('.site-page').forEach(x=>{x.hidden=x.id!=='page-'+page;});
 $('mobileMenu').classList.remove('open');$('menuToggle').setAttribute('aria-expanded','false');
}
async function navigate(href,historyUpdate=true){
 const url=new URL(href,location.origin);const page=paths.has(url.pathname)?url.pathname.slice(1):'beranda';
 if(historyUpdate)history.pushState({},'',url.pathname+url.search+url.hash);
 navActive(page);window.scrollTo({top:0,behavior:'instant'});
 if(page==='beranda')await loadHome();
 if(page==='jelajahi'){
   state.q=url.searchParams.get('q')||'';state.category=url.searchParams.get('category')||'semua';
   $('browseInput').value=state.q;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===state.category));
   await loadBrowse();
 }
 if(page==='jual')await loadMyProducts();
 if(page==='keranjang')await loadCart();
 if(page==='favorit')await loadFavorites();
 // Halaman Pesan masih Coming Soon.
 if(page==='akun')await loadAccount();
 if(url.hash){requestAnimationFrame(()=>document.getElementById(url.hash.slice(1))?.scrollIntoView({behavior:'instant'}));}
}

function productCard(p){
 const id=Number(p.id),out=!p.available,liked=state.favorites.has(id);
 return `<article class="product ${out?'si-out-of-stock':''}" data-product-id="${id}" data-category="${esc(p.category)}">
   <div class="product-image">${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}
     <button type="button" class="product-heart ${liked?'liked':''}" data-wish="${id}" aria-label="${liked?'Hapus favorit':'Simpan favorit'}">${liked?'♥':'♡'}</button>
     ${picture(p,'si-product-img')}</div>
   <div class="product-info"><div class="product-name">${esc(p.name)}</div><div class="product-bottom"><span class="price">${rupiah(p.price)}</span><span class="condition">${esc(p.condition)}</span></div>
   <div class="product-actions"><button class="add-cart" type="button" data-add="${id}" ${out?'disabled':''}>${out?'Sudah dipesan':'+ Keranjang'}</button><button class="detail-btn" type="button" data-detail="${id}">Detail</button></div></div></article>`;
}
async function refreshProducts(){const data=await api('/products');state.products=data.products;return state.products;}
function loadRecommend(){
 const grid=$('recommendGrid');if(!grid)return;
 // Produk yang bisa ditampilkan; tidak membuat angka penjualan atau ulasan palsu.
 const samples=state.products.filter(x=>x.available).slice(0,4);
 grid.innerHTML=samples.map(p=>`<article class="recommend-card" data-detail="${Number(p.id)}" tabindex="0" role="button">${picture(p)}<div class="recommend-info"><div class="recommend-name">${esc(p.name)}</div><div class="recommend-price">${rupiah(p.price)}</div></div></article>`).join('');
}
async function loadHome(){
 try{await refreshProducts();$('homeProducts').innerHTML=state.products.filter(x=>x.available).slice(0,4).map(productCard).join('');loadRecommend();}catch(e){toast(e.message);}
}
async function loadBrowse(){
 try{
  const p=new URLSearchParams({category:state.category,q:state.q,condition:$('conditionFilter').value,sort:$('sortProducts').value});
  if($('minPrice').value)p.set('min',$('minPrice').value);
  if($('maxPrice').value)p.set('max',$('maxPrice').value);
  const result=await api('/products?'+p.toString());
  $('productCount').textContent=result.products.length+' barang';
  $('marketProducts').innerHTML=result.products.map(productCard).join('');
  $('marketEmpty').hidden=result.products.length>0;
 }catch(e){toast(e.message);}
}
function showDetail(id){
 const p=state.products.find(p=>Number(p.id)===Number(id));if(!p){toast('Barang tidak ditemukan.');return;}
 $('detailContent').innerHTML=`<div class="si-detail-grid"><div>${picture(p)}</div><div><h3>${esc(p.name)}</h3><p>${esc(p.category)} · ${esc(p.condition)}</p><div class="detail-price">${rupiah(p.price)}</div><p>Penjual: ${esc(p.seller_name||'Member Second In')}</p>${p.description?`<p>${esc(p.description)}</p>`:''}<p>${p.available?'Barang masih tersedia':'Barang ini sudah dipesan.'}</p><div class="si-detail-actions"><button class="primary-btn" data-add="${Number(p.id)}" ${!p.available?'disabled':''}>+ Keranjang</button><button class="detail-btn" data-chat="${Number(p.id)}">Chat penjual</button></div></div></div>`;
 $('detailModal').hidden=false;$('detailModal').classList.add('open');
}
function closeDetail(){$('detailModal').classList.remove('open');$('detailModal').hidden=true;}
async function updateCounts(){
 if(!state.user){$('cartCounter').hidden=true;state.favorites=new Set();return;}
 try{
 const [c,w]=await Promise.all([api('/cart'),api('/wishlist')]);state.cartItems=c.items;state.cartTotal=c.total;
 state.favorites=new Set(w.products.map(p=>Number(p.id)));$('cartCounter').textContent=c.items.length;$('cartCounter').hidden=!c.items.length;
 }catch(e){console.warn(e);}
}
async function addCart(id){if(!await requireLogin())return;
 try{await send('/cart','POST',{productId:id});await updateCounts();toast('Masuk keranjang.');}catch(e){toast(e.message);}
}
async function toggleWish(id){if(!await requireLogin())return;
 try{await send('/wishlist/'+id,'POST',{});await updateCounts();
 document.querySelectorAll(`[data-wish="${id}"]`).forEach(el=>{const active=state.favorites.has(id);el.classList.toggle('liked',active);el.textContent=active?'♥':'♡';});
 if(location.pathname==='/favorit')loadFavorites();toast(state.favorites.has(id)?'Disimpan ke favorit.':'Dihapus dari favorit.');}catch(e){toast(e.message);}
}
async function loadFavorites(){
 if(!state.user){$('favoriteProducts').innerHTML='';$('favoriteEmpty').textContent='Masuk dulu untuk menyimpan barang favorit.';return;}
 try{const data=await api('/wishlist');$('favoriteProducts').innerHTML=data.products.map(productCard).join('');$('favoriteEmpty').textContent=data.products.length?'':'Belum ada barang favorit. Klik ikon hati pada barang yang disukai.';}
 catch(e){toast(e.message);}
}
async function loadCart(){
 const container=$('cartItems');if(!state.user){container.innerHTML='<p class="si-muted">Masuk dulu untuk melihat keranjang.</p>';$('cartTotal').textContent='';$('checkoutButton').disabled=true;return;}
 try{
  const data=await api('/cart');state.cartItems=data.items;state.cartTotal=data.total;
  container.innerHTML=data.items.map(p=>`<div class="si-cart-line">${picture(p)}<div><strong>${esc(p.name)}</strong><p>${rupiah(p.price)}</p></div><button class="si-mini-link" data-remove-cart="${Number(p.id)}">Hapus</button></div>`).join('')||'<p class="si-muted">Keranjang masih kosong. Yuk cari barang dulu.</p>';
  $('cartTotal').innerHTML=data.items.length?`<span>Total</span><span>${rupiah(data.total)}</span>`:'';
  $('checkoutButton').disabled=!data.items.length;
 }catch(e){toast(e.message);}
}
async function checkout(){if(!await requireLogin())return;if(!confirm('Buat pesanan contoh dari barang di keranjang?'))return;
 try{const data=await send('/orders','POST',{});toast('Pesanan #'+data.orderId+' berhasil dibuat.');await updateCounts();navigate('/akun');}catch(e){toast(e.message);}
}
async function loadMyProducts(){
 if(!state.user){$('myProducts').innerHTML='';$('myProductsEmpty').textContent='Masuk dulu untuk melihat barang yang kamu jual.';return;}
 try{const data=await api('/products/my');$('myProducts').innerHTML=data.products.map(p=>productCard(p).replace('</article>',p.available?`<button type="button" class="si-mini-link" data-delete-product="${Number(p.id)}" style="margin:0 0 12px 4px">Hapus barang</button></article>`:'</article>')).join('');$('myProductsEmpty').textContent=data.products.length?'':'Belum ada barang yang kamu pasang.';}catch(e){toast(e.message);}
}
async function loadAccount(){
 $('authArea').hidden=!!state.user;$('loggedInArea').hidden=!state.user; if($('navAccountLink')){$('navAccountLink').textContent=state.user?'Akun':'Masuk';$('navAccountLink').setAttribute('aria-label',state.user?'Akun':'Masuk');}
 if(!state.user)return;
 $('accountName').textContent=state.user.name;$('accountEmail').textContent=state.user.email;
 try{
  const [b,s]=await Promise.all([api('/orders'),api('/sales')]);
  $('myOrders').innerHTML=b.orders.map(o=>`<div class="si-order"><strong>Pesanan #${o.id}</strong><br><small>${esc(o.created_at)} · ${esc(o.status)}</small><br>${o.items.map(x=>esc(x.item_name)).join(', ')}<br><b>${rupiah(o.total)}</b></div>`).join('')||'<p class="si-muted">Belum ada pesanan.</p>';
  const next={'Menunggu konfirmasi':'Diproses','Diproses':'Dikirim','Dikirim':'Selesai'};
  $('sellerOrders').innerHTML=s.sales.map(o=>`<div class="si-order"><strong>Pesanan #${o.id} — ${esc(o.item_name)}</strong><br><small>Pembeli: ${esc(o.buyer_name)} · ${esc(o.status)}</small><br>${rupiah(o.price)}${next[o.status]?`<br><button class="reset-filter" data-order="${o.id}" data-status="${next[o.status]}">Tandai ${next[o.status]}</button>`:''}</div>`).join('')||'<p class="si-muted">Belum ada pesanan masuk.</p>';
 }catch(e){toast(e.message);}
}
async function refreshSession(){try{const data=await api('/me');state.user=data.user;await updateCounts();}catch(e){console.warn('Sesi:',e.message);}if($('navAccountLink'))$('navAccountLink').textContent=state.user?'Akun':'Masuk';}
async function loginOrRegister(form,endpoint){
 const obj=Object.fromEntries(new FormData(form).entries());
 try{const data=await send(endpoint,'POST',obj);state.user=data.user;form.reset();await updateCounts();toast('Halo, '+data.user.name+'!');navigate('/akun');}catch(e){toast(e.message);}
}
async function logout(){try{await send('/logout','POST',{});state.user=null;state.favorites=new Set();await updateCounts();toast('Sudah keluar.');navigate('/beranda');}catch(e){toast(e.message);}}
async function submitListing(form){
 if(!await requireLogin())return;
 const fd=new FormData(form);
 const photo=fd.get('image_file');
 const data={name:String(fd.get('name')||''),category:String(fd.get('category')||''),price:Number(fd.get('price')||0),condition:String(fd.get('condition')||''),description:String(fd.get('description')||'')};
 const btn=form.querySelector('[type="submit"]');
 if(btn){btn.disabled=true;btn.textContent='Mengunggah...';}
 try{
   data.image_url=await uploadPhoto(photo);
   await send('/products','POST',data);
   toast('Barang berhasil dipasang.');form.reset();await refreshProducts();await navigate('/jelajahi');
 }catch(e){toast(e.message);}
 finally{if(btn){btn.disabled=false;btn.textContent='Posting barang';}}
}
async function loadThreads(){
 if(!state.user){$('threadList').innerHTML='<p class="si-muted">Masuk dulu untuk mulai chat.</p>';$('messageList').innerHTML='<p class="si-muted">Belum ada percakapan.</p>';return;}
 try{
  const d=await api('/conversations');
  $('threadList').innerHTML=d.conversations.map(t=>`<button type="button" class="si-thread ${state.conversation && Number(state.conversation.productId)===Number(t.product_id)&&Number(state.conversation.buyerId)===Number(t.buyer_id)?'active':''}" data-thread-product="${Number(t.product_id)}" data-thread-buyer="${Number(t.buyer_id)}"><strong>${esc(t.product_name)}</strong><small>${esc(t.buyer_name)} · ${esc(t.last_message||'')}</small></button>`).join('')||'<p class="si-muted">Belum ada obrolan. Klik “Chat penjual” dari detail barang.</p>';
  if(state.conversation)await loadMessages();
 }catch(e){toast(e.message);}
}
async function chatSeller(id){closeDetail();await navigate('/pesan');}
async function loadMessages(){
 if(!state.conversation)return;const c=state.conversation;
 try{const params=new URLSearchParams({productId:c.productId,buyerId:c.buyerId});const data=await api('/messages?'+params);
 $('conversationTitle').textContent=c.productName||'Percakapan barang';
 $('messageList').innerHTML=data.messages.map(m=>`<div class="si-message ${Number(m.sender_id)===Number(state.user.id)?'mine':''}">${esc(m.body)}<small>${esc(m.sender_name)} · ${esc(m.created_at)}</small></div>`).join('')||'<p class="si-muted">Belum ada pesan. Mulai dari sini, ya.</p>';
 $('messageList').scrollTop=$('messageList').scrollHeight;
 }catch(e){toast(e.message);}
}
async function sendChat(){if(!state.conversation){toast('Pilih percakapannya dulu.');return;}
 const input=$('chatText'),body=input.value.trim();if(!body)return;
 try{await send('/messages','POST',{productId:state.conversation.productId,buyerId:state.conversation.buyerId,body});input.value='';await loadThreads();}catch(e){toast(e.message);}
}
function collectBrowseFilters(){state.q=$('browseInput').value.trim();const p=new URLSearchParams();if(state.q)p.set('q',state.q);if(state.category!=='semua')p.set('category',state.category);
 history.replaceState({},'', '/jelajahi'+(p.toString()?'?'+p:''));loadBrowse();}
function events(){
 document.addEventListener('click',async ev=>{
  const link=ev.target.closest('a[data-route]');if(link){ev.preventDefault();navigate(link.getAttribute('href'));return;}
  const category=ev.target.closest('.category[data-search-category]');if(category){navigate('/jelajahi?category='+encodeURIComponent(category.dataset.searchCategory));return;}
  const filter=ev.target.closest('[data-filter]');if(filter){state.category=filter.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===filter));collectBrowseFilters();return;}
  const detail=ev.target.closest('[data-detail]');if(detail){showDetail(Number(detail.dataset.detail));return;}
  const add=ev.target.closest('[data-add]');if(add){await addCart(Number(add.dataset.add));return;}
  const wish=ev.target.closest('[data-wish]');if(wish){await toggleWish(Number(wish.dataset.wish));return;}
  const chat=ev.target.closest('[data-chat]');if(chat){await chatSeller(Number(chat.dataset.chat));return;}
  const delProduct=ev.target.closest('[data-delete-product]');if(delProduct){
    if(!confirm('Hapus barang ini dari etalase?'))return;
    try{await api('/products/'+delProduct.dataset.deleteProduct,{method:'DELETE'});await refreshProducts();toast('Barang dihapus.');loadMyProducts();}catch(e){toast(e.message);}return;
  }
  const remove=ev.target.closest('[data-remove-cart]');if(remove){try{await api('/cart/'+remove.dataset.removeCart,{method:'DELETE'});await updateCounts();loadCart();}catch(e){toast(e.message);}return;}
  const order=ev.target.closest('[data-order]');if(order){try{await send('/orders/'+order.dataset.order,'PATCH',{status:order.dataset.status});toast('Status pesanan diperbarui.');loadAccount();}catch(e){toast(e.message);}return;}
  const thread=ev.target.closest('[data-thread-product]');if(thread){
    const p=state.products.find(p=>Number(p.id)===Number(thread.dataset.threadProduct));
    state.conversation={productId:Number(thread.dataset.threadProduct),buyerId:Number(thread.dataset.threadBuyer),productName:p?.name||'Percakapan'};loadThreads();return;}
  if(ev.target.closest('[data-close-detail]') || ev.target===$('detailModal')){closeDetail();return;}
 });
 document.querySelectorAll('.category[data-search-category]').forEach(x=>x.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate('/jelajahi?category='+encodeURIComponent(x.dataset.searchCategory));}}));
 $('menuToggle').addEventListener('click',()=>{const m=$('mobileMenu');m.classList.toggle('open');$('menuToggle').setAttribute('aria-expanded',m.classList.contains('open'));});
 $('searchButton').addEventListener('click',()=>navigate('/jelajahi?q='+encodeURIComponent($('searchInput').value.trim())));
 $('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')navigate('/jelajahi?q='+encodeURIComponent(e.target.value.trim()));});
 $('browseSearch').addEventListener('click',collectBrowseFilters);
 $('browseInput').addEventListener('keydown',e=>{if(e.key==='Enter')collectBrowseFilters();});
 ['conditionFilter','sortProducts','minPrice','maxPrice'].forEach(id=>$(id).addEventListener('change',collectBrowseFilters));
 $('resetFilters').addEventListener('click',()=>{$('browseInput').value='';$('minPrice').value='';$('maxPrice').value='';$('sortProducts').value='default';$('conditionFilter').value='semua';state.category='semua';document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter==='semua'));collectBrowseFilters();});
 $('sellButton').addEventListener('click',()=>navigate('/jual'));
 $('checkoutButton').addEventListener('click',checkout);
 $('loginForm').addEventListener('submit',e=>{e.preventDefault();loginOrRegister(e.target,'/login');});
 $('registerForm').addEventListener('submit',e=>{e.preventDefault();loginOrRegister(e.target,'/register');});
 $('sellForm').addEventListener('submit',e=>{e.preventDefault();submitListing(e.target);});
 // Chat belum dibuka, halaman Coming Soon.
 $('logoutButton').addEventListener('click',logout);
 window.addEventListener('popstate',()=>navigate(location.pathname+location.search,false));
 window.addEventListener('scroll',()=>$('navbar').classList.toggle('scrolled',scrollY>20),{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDetail();$('mobileMenu').classList.remove('open');}});
}
(async()=>{events();await refreshSession();try{await refreshProducts();}catch(e){toast(e.message);}await navigate(location.pathname+location.search,false);})();
