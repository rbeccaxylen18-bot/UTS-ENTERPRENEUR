/* SECOND IN — interaksi marketplace, tetap memakai halaman dan server ETP. */
'use strict';
const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {user:null,products:[],favorites:new Set(),category:'semua',q:'',cartItems:[],cartTotal:0,selected:new Set(),selectionReady:false,conversation:null,checkout:null,addresses:[],editing:null,orderFilter:'all',modalSubmit:null,homeSort:'new'};
const routes = new Set(['beranda','jelajahi','jual','keranjang','favorit','pesan','akun','masuk','daftar','bantuan','barang','toko','checkout','pembayaran','pesanan','alamat','notifikasi']);
const rupiah = n => 'Rp'+Number(n||0).toLocaleString('id-ID');
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image = src => /^(https?:\/\/|\/uploads\/[a-f0-9]{32}\.(jpg|png)$)/i.test(String(src))?esc(src):'/fallback.svg';
const picture = (p,cls='') => `<img class="${cls}" src="${image(p.image_url)}" alt="${esc(p.name||p.item_name)}" loading="lazy">`;
const date = value => value?new Date(String(value).replace(' ','T')+'Z').toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}):'—';
const empty = text => `<div class="si5-empty">${esc(text)}</div>`;
const field = (label,name,value='',type='text',attrs='') => `<div class="field"><label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label></div>`;
const pill = status => `<span class="si5-status ${status==='Menunggu pembayaran'?'pending':['Dibatalkan','Kedaluwarsa','Dikembalikan'].includes(status)?'muted':''}">${esc(status)}</span>`;
let toastTimer,browseVersion=0,quoteVersion=0,modalFocus,filterTimer,navigationVersion=0;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
async function api(path,options={}){
 const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(options.body&&!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 const data=await response.json().catch(()=>({message:'Jalankan server.py, lalu buka web melalui localhost:8000.'}));
 if(!response.ok){const error=new Error(data.message||'Permintaan belum berhasil.');error.status=response.status;error.code=data.code;throw error;}
 return data;
}
const send=(path,method,body={})=>api(path,{method,body:JSON.stringify(body)});
async function attempt(fn){try{return await fn();}catch(error){toast(error.message);return null;}}
async function busy(button,fn){if(button?.disabled)return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Sebentar…';}try{return await fn();}finally{if(button){button.disabled=false;button.textContent=old;}}}
function rememberCheckout(){if(state.checkout)sessionStorage.setItem('secondinCheckout',JSON.stringify(state.checkout));else sessionStorage.removeItem('secondinCheckout');}
function newCheckout(ids,source='cart'){
 state.checkout={product_ids:ids,source,address_id:0,shipping:{},payment_method:'bank_transfer',note:'',checkout_ref:crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)};
 rememberCheckout();
}
async function requireLogin(){if(state.user)return true;sessionStorage.setItem('secondinReturn',location.pathname+location.search);toast('Masuk dulu untuk melanjutkan.');await navigate('/masuk');return false;}
function navActive(page){
 $$('.site-page').forEach(el=>el.hidden=el.id!=='page-'+page);
 $$('.nav-center a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='/'+page));
 $('mobileMenu').classList.remove('open');$('menuToggle').setAttribute('aria-expanded','false');
}
async function navigate(href,push=true){
 const url=new URL(href,location.origin);const route=routes.has(url.pathname.slice(1))?url.pathname.slice(1):'beranda';const page=['masuk','daftar'].includes(route)?'akun':route;
 const version=++navigationVersion;closeModal();
 if(push)history.pushState({},'',url.pathname+url.search+url.hash);
 navActive(page);window.scrollTo({top:0,behavior:'instant'});
 try{
  if(page==='beranda')await loadHome();
  if(page==='jelajahi'){syncBrowse(url.searchParams);await loadBrowse();}
  if(page==='jual')await loadMyProducts();
  if(page==='keranjang')await loadCart();
  if(page==='favorit')await loadFavorites();
  if(page==='pesan')await loadThreads();
  if(page==='akun'){if(state.user&&['masuk','daftar'].includes(route))history.replaceState({},'','/akun');await loadAccount(route==='daftar'?'register':'login');}
  if(page==='barang')await showProduct(Number(url.searchParams.get('id')));
  if(page==='toko')await loadShop(Number(url.searchParams.get('id')));
  if(page==='checkout')await loadCheckout();
  if(page==='pembayaran')await loadPayment(url.searchParams.get('orders'));
  if(page==='pesanan'){state.orderFilter=url.searchParams.get('status')||'all';await loadOrders();}
  if(page==='alamat')await loadAddresses();
  if(page==='notifikasi')await loadNotifications();
  if(url.hash&&version===navigationVersion)requestAnimationFrame(() => $(url.hash.slice(1))?.scrollIntoView({behavior:'instant'}));
 }catch(error){toast(error.message);}
}
function likeContent(liked,count){return `<span class="si5-heart-icon" aria-hidden="true">${liked?'♥':'♡'}</span><span class="si5-like-number">${Number(count||0).toLocaleString('id-ID')}</span>`;}
function likeButton(p){const liked=state.favorites.has(Number(p.id)),count=Number(p.like_count||0);return `<button type="button" class="product-heart si5-like-pill ${liked?'liked':''}" data-wish="${p.id}" aria-pressed="${liked}" aria-label="${liked?'Hapus dari':'Simpan ke'} favorit; ${count} pengguna menyukai barang ini" title="${count} pengguna menyukai barang ini">${likeContent(liked,count)}</button>`;}
function productCard(p){
 const unavailable=!p.available;const own=state.user?.id===p.seller_id;const liked=state.favorites.has(Number(p.id));
 return `<article class="product ${unavailable?'si-out-of-stock':''}" data-product-id="${p.id}"><div class="product-image">${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}${likeButton(p)}<a data-route href="/barang?id=${p.id}">${picture(p,'si-product-img')}</a></div><div class="product-info"><a data-route href="/barang?id=${p.id}" class="product-name">${esc(p.name)}</a><div class="product-bottom"><span class="price">${rupiah(p.price)}</span><span class="condition">${esc(p.condition)}</span></div><div class="si5-product-meta">${esc([p.brand,p.size].filter(Boolean).join(' · '))||'<span aria-hidden="true">&nbsp;</span>'}</div><div class="si5-product-seller"><a data-route href="/toko?id=${p.seller_id}">${esc(p.seller_name)}</a><span>${esc(p.seller_city||'')}</span></div><div class="product-actions">${own?'<a class="add-cart" data-route href="/jual">Kelola barang</a>':`<button type="button" class="add-cart" data-buy="${p.id}" ${unavailable?'disabled':''}>${unavailable?'Sudah dipesan':'Beli sekarang'}</button>`}<a class="detail-btn" data-route href="/barang?id=${p.id}">Detail</a></div></div></article>`;
}
async function refreshProducts(){const data=await api('/products');state.products=data.products;return data.products;}
function renderHomeProducts(){
 const available=state.products.filter(p=>p.available),sorted=[...available];
 if(state.homeSort==='low')sorted.sort((a,b)=>a.price-b.price||b.id-a.id);
 if(state.homeSort==='liked')sorted.sort((a,b)=>b.like_count-a.like_count||b.id-a.id);
 $('homeProducts').innerHTML=sorted.slice(0,8).map(productCard).join('')||empty('Belum ada barang tersedia.');
 $('homeProductCount').textContent=available.length+' barang tersedia';
 $$('[data-home-sort]').forEach(b=>{const active=b.dataset.homeSort===state.homeSort;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function compactProduct(p){return `<article class="si8-compact-product"><div class="si5-recommend-image"><a data-route href="/barang?id=${p.id}">${picture(p)}</a>${likeButton(p)}</div><a class="si8-compact-copy" data-route href="/barang?id=${p.id}"><span>${esc(p.name)}</span><strong>${rupiah(p.price)}</strong></a></article>`;}
function recentIds(){try{const value=JSON.parse(sessionStorage.getItem('secondinViewed')||'[]');return Array.isArray(value)?value.filter(Number.isSafeInteger).slice(0,8):[];}catch{return [];}}
function rememberViewed(id){try{sessionStorage.setItem('secondinViewed',JSON.stringify([id,...recentIds().filter(x=>x!==id)].slice(0,8)));}catch{}}
function renderRecent(){const products=recentIds().map(id=>state.products.find(p=>p.id===id&&p.available)).filter(Boolean);$('homeRecent').hidden=!products.length;$('recentProducts').innerHTML=products.map(compactProduct).join('');}
async function loadHome(){
 await refreshProducts();const available=state.products.filter(p=>p.available);
 renderHomeProducts();
 const affordable=[...available].filter(p=>p.price<50000).sort((a,b)=>a.price-b.price||b.id-a.id).slice(0,8);$('homeAffordable').hidden=!affordable.length;$('affordableProducts').innerHTML=affordable.map(compactProduct).join('');renderRecent();
 const budgets=[['Di bawah Rp25 ribu',0,24999],['Rp25–50 ribu',25000,50000],['Rp50–100 ribu',50001,100000],['Di atas Rp100 ribu',100001,null]];
 $('budgetLinks').innerHTML=budgets.map(([label,min,max])=>{const count=available.filter(p=>p.price>=min&&(max===null||p.price<=max)).length;const params=new URLSearchParams({min:String(min),sort:'low',availability:'available'});if(max!==null)params.set('max',String(max));return `<a data-route href="/jelajahi?${params}"><strong>${label}</strong><span>${count} barang <span aria-hidden="true">↗</span></span></a>`;}).join('');
 const brands=new Map();available.filter(p=>p.brand).forEach(p=>brands.set(p.brand,(brands.get(p.brand)||0)+1));
 $('homeBrands').hidden=!brands.size;
 $('brandLinks').innerHTML=[...brands.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'id')).slice(0,8).map(([brand,count])=>`<a data-route href="/jelajahi?brand=${encodeURIComponent(brand)}&availability=available"><strong>${esc(brand)}</strong><span>${count} barang</span></a>`).join('');
 const more=available.slice(8,12);$('rekomendasi').hidden=!more.length;
 $('recommendGrid').innerHTML=more.map(p=>`<article class="recommend-card"><div class="si5-recommend-image"><a data-route href="/barang?id=${p.id}">${picture(p)}</a>${likeButton(p)}</div><a class="recommend-info" data-route href="/barang?id=${p.id}"><div class="recommend-name">${esc(p.name)}</div><div class="recommend-price">${rupiah(p.price)}</div></a></article>`).join('');
}
function syncBrowse(params){
 state.q=params.get('q')||'';state.category=params.get('category')||'semua';$('browseInput').value=state.q;
 for(const [id,key,initial] of [['conditionFilter','condition','semua'],['sortProducts','sort','default'],['minPrice','min',''],['maxPrice','max',''],['brandFilter','brand','semua'],['sizeFilter','size','semua'],['cityFilter','city',''],['availabilityFilter','availability','available']])$(id).value=params.get(key)||initial;
 $$('#categoryFilters [data-filter]').forEach(b=>{const active=b.dataset.filter===state.category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function browseParams(){return new URLSearchParams({category:state.category,q:$('browseInput').value.trim(),condition:$('conditionFilter').value,sort:$('sortProducts').value,min:$('minPrice').value,max:$('maxPrice').value,brand:$('brandFilter').value||'semua',size:$('sizeFilter').value||'semua',city:$('cityFilter').value.trim(),availability:$('availabilityFilter').value});}
async function loadBrowse(){
 const version=++browseVersion;const params=browseParams();const min=params.get('min'),max=params.get('max');
 const invalid=(min&&Number(min)<0)||(max&&Number(max)<0)||(min&&max&&Number(min)>Number(max));
 $('filterError').hidden=!invalid;$('filterError').textContent=invalid?'Harga tidak boleh negatif, dan minimum tidak boleh melebihi maksimum.':'';
 if(invalid){$('marketProducts').innerHTML='';$('productCount').textContent='0 barang';$('marketEmpty').hidden=false;return;}
 const result=await api('/products?'+params);if(version!==browseVersion)return;
 $('marketProducts').innerHTML=result.products.map(productCard).join('');$('productCount').textContent=result.products.length+' barang';$('marketEmpty').hidden=!!result.products.length;
}
async function collectBrowseFilters(){state.q=$('browseInput').value.trim();history.replaceState({},'','/jelajahi?'+browseParams());await loadBrowse();}
async function loadCatalogOptions(){const d=await api('/catalog-options');for(const [id,key,label] of [['brandFilter','brands','merek'],['sizeFilter','sizes','ukuran']]){const current=$(id).value;$(id).innerHTML=`<option value="semua">Semua ${label}</option>`+d[key].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(d[key].includes(current))$(id).value=current;}}
async function updateCounts(){
 if(!state.user){$('cartCounter').hidden=true;state.favorites.clear();$$('.notice-badge').forEach(el=>el.textContent='');return;}
 const [c,w,n]=await Promise.all([api('/cart'),api('/wishlist'),api('/notifications')]);state.cartItems=c.items;state.cartTotal=c.total;state.favorites=new Set(w.products.map(p=>Number(p.id)));$('cartCounter').textContent=c.items.length;$('cartCounter').hidden=!c.items.length;
 $$('.notice-badge').forEach(el=>el.textContent=n.unread?`(${n.unread})`:'');
}
async function addCart(id){if(!await requireLogin())return;await send('/cart','POST',{productId:id});await updateCounts();toast('Barang masuk keranjang.');}
async function buyNow(id){if(!await requireLogin())return;newCheckout([id],'direct');await navigate('/checkout');}
async function toggleWish(id){
 if(!await requireLogin())return;
 const buttons=$$(`[data-wish="${id}"]`);if(buttons.some(b=>b.disabled))return;buttons.forEach(b=>b.disabled=true);
 try{
  const result=await send('/wishlist/'+id,'POST');if(result.liked)state.favorites.add(id);else state.favorites.delete(id);
  state.products.forEach(p=>{if(Number(p.id)===id)p.like_count=result.like_count;});
  $$(`[data-wish="${id}"]`).forEach(button=>{button.classList.toggle('liked',result.liked);button.innerHTML=likeContent(result.liked,result.like_count);button.setAttribute('aria-pressed',String(result.liked));button.setAttribute('aria-label',`${result.liked?'Hapus dari':'Simpan ke'} favorit; ${result.like_count} pengguna menyukai barang ini`);button.title=result.like_count+' pengguna menyukai barang ini';});
  if(location.pathname==='/favorit')await loadFavorites();toast(result.liked?'Disimpan ke favorit.':'Dihapus dari favorit.');
 }finally{buttons.forEach(b=>b.disabled=false);}
}
async function loadFavorites(){
 if(!state.user){$('favoriteProducts').innerHTML='';$('favoriteEmpty').innerHTML='Masuk ke akun untuk melihat barang favoritmu.';return;}
 const data=await api('/wishlist');$('favoriteProducts').innerHTML=data.products.map(productCard).join('');$('favoriteEmpty').textContent=data.products.length?'':'Belum ada produk favorit. Tekan ikon hati untuk menyimpan produk.';
}
function avatar(user,cls='si5-avatar'){return `<span class="${cls}">${user.avatar_url?`<img src="${image(user.avatar_url)}" alt="Foto profil ${esc(user.name)}">`:initials(user.name)}</span>`;}
function initials(name){return esc((name||'S').trim().charAt(0).toUpperCase());}
async function showProduct(id){
 $('productDetail').innerHTML=empty('Memuat barang…');const d=await api('/products/'+id);const p=d.product,s=d.seller;rememberViewed(p.id);const own=state.user?.id===p.seller_id;
 $('productDetail').innerHTML=`<a class="si5-text-link" data-route href="/jelajahi?category=${encodeURIComponent(p.category)}">← Kembali ke ${esc(p.category)}</a><div class="si5-detail" style="margin-top:20px"><div><img id="galleryMain" class="si5-gallery-main" src="${image(p.photos[0])}" alt="${esc(p.name)}"><div class="si5-thumbs">${p.photos.map((src,i)=>`<button data-photo="${image(src)}" class="${i===0?'active':''}" aria-label="Foto ${i+1}"><img src="${image(src)}" alt="Foto ${i+1} ${esc(p.name)}"></button>`).join('')}</div></div><div><span class="si5-status">${p.available?'Masih tersedia':'Sudah dipesan'}</span><h2>${esc(p.name)}</h2><div class="si5-price">${rupiah(p.price)}</div><dl class="si5-specs">${[['Kondisi',p.condition],['Merek',p.brand],['Ukuran',p.size],['Warna',p.color]].filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value||'Belum ditambahkan')}</dd></div>`).join('')}</dl><h3>Detail barang</h3><p class="si5-description">${esc(p.description||'Penjual belum menambahkan deskripsi. Tanyakan detail barang lewat chat sebelum membeli.')}</p>${own?`<a class="primary-btn" data-route href="/jual">Kelola barangmu</a>`:`<button class="primary-btn si5-wide" data-buy="${p.id}" ${p.available?'':'disabled'}>Beli sekarang</button><div class="si5-actions"><button class="reset-filter" data-add="${p.id}" ${p.available?'':'disabled'}>+ Keranjang</button><button class="reset-filter" data-chat="${p.id}">Chat penjual</button><button class="reset-filter" data-negotiate="${p.id}" ${p.available?'':'disabled'}>Nego harga</button></div>`}<div class="si5-seller-mini">${avatar(s,'si5-avatar')}<div><a data-route href="/toko?id=${s.id}"><strong>${esc(s.name)} →</strong></a><small>${esc(s.city||'Lokasi belum ditambahkan')} · ${s.review_count?`${Number(s.rating).toFixed(1)} / 5 (${s.review_count} ulasan)`:'Belum ada ulasan'}</small></div></div><p class="si5-note">Setiap barang hanya tersedia satu unit. Cek foto dan ukuran; kamu bisa bertanya sebelum checkout.</p></div></div>`;
}
async function loadShop(id){const {seller:s,products}=await api('/sellers/'+id);$('sellerDetail').innerHTML=`<div class="si-panel"><div class="si5-shop-header">${avatar(s,'si5-avatar')}<div><h2>${esc(s.name)}</h2><p>${esc(s.city||'Lokasi belum ditambahkan')}</p></div>${state.user?.id===id?'':`<button class="reset-filter" data-follow="${id}">${s.following?'Mengikuti':'Ikuti toko'}</button>`}</div><p>${esc(s.bio||'Belum ada deskripsi toko.')}</p><div class="si5-shop-stat"><span><strong>${products.filter(p=>p.available).length}</strong> barang tersedia</span><span><strong>${s.sold}</strong> barang terjual</span><span><strong>${s.review_count?Number(s.rating).toFixed(1):'—'}</strong> · ${s.review_count} ulasan</span><span>${s.followers} pengikut</span></div></div><h3 style="margin-bottom:20px">Barang dari toko ini</h3><div class="products">${products.map(productCard).join('')}</div><div class="si-panel" style="margin-top:35px"><h3>Ulasan pembeli</h3>${s.reviews.length?s.reviews.map(r=>`<article class="si5-review"><strong>${esc(r.buyer_name)}</strong> · ${r.rating}/5 <small class="si-muted">${date(r.created_at)}</small><p>${esc(r.body)}</p></article>`).join(''):empty('Belum ada ulasan. Ulasan muncul setelah pesanan selesai.')}</div>`;}
function itemLine(p,extra=''){return `<div class="si5-item">${extra}${picture({name:p.name||p.item_name,image_url:p.image_url})}<div class="si5-item-copy"><strong>${esc(p.name||p.item_name)}</strong><p>${esc([p.brand,p.size].filter(Boolean).join(' · '))}</p><strong>${rupiah(p.price)}</strong></div></div>`;}
function totals(data){return `<div>Subtotal barang <span>${rupiah(data.item_total)}</span></div><div>Pengiriman <span>${rupiah(data.shipping_cost)}</span></div><div>Biaya layanan <span>${rupiah(data.service_fee)}</span></div><div class="grand">Total <span>${rupiah(data.total)}</span></div>`;}
async function loadCart(){
 if(!state.user){$('cartItems').innerHTML=empty('Masuk dulu untuk melihat keranjang.');$('cartTotal').innerHTML='';$('checkoutButton').disabled=true;return;}
 const data=await api('/cart');state.cartItems=data.items;state.cartTotal=data.total;
 if(!state.selectionReady){state.selected=new Set(data.items.filter(p=>p.available).map(p=>p.id));state.selectionReady=true;}
 const groups=new Map();for(const p of data.items){if(!groups.has(p.seller_id))groups.set(p.seller_id,[]);groups.get(p.seller_id).push(p);}
 $('cartItems').innerHTML=data.items.length?[...groups.entries()].map(([sid,items])=>`<div class="si5-cart-group"><a data-route href="/toko?id=${sid}"><strong>${esc(items[0].seller_name)}</strong></a>${items.map(p=>`<div class="si5-item"><input type="checkbox" aria-label="Pilih ${esc(p.name)}" data-cart-check="${p.id}" ${p.available?'':'disabled'} ${state.selected.has(p.id)&&p.available?'checked':''}>${picture(p)}<div class="si5-item-copy"><a data-route href="/barang?id=${p.id}"><strong>${esc(p.name)}</strong></a><p>${p.available?'1 barang': 'Barang sudah dipesan'}</p><strong>${rupiah(p.price)}</strong></div><button class="si5-text-button" data-remove-cart="${p.id}">Hapus</button></div>`).join('')}</div>`).join(''):empty('Keranjang masih kosong. Cari barang yang kamu suka dulu.');
 updateCartSummary();
}
function updateCartSummary(){const chosen=state.cartItems.filter(p=>p.available&&state.selected.has(p.id));$('cartTotal').innerHTML=`<div>Barang dipilih <span>${chosen.length}</span></div><div class="grand">Subtotal <span>${rupiah(chosen.reduce((sum,p)=>sum+p.price,0))}</span></div><p class="si5-note">Ongkir dihitung saat checkout.</p>`;$('checkoutButton').disabled=!chosen.length;$('cartSelectAll').checked=!!chosen.length&&chosen.length===state.cartItems.filter(p=>p.available).length;}
async function startCheckout(){if(!await requireLogin())return;const ids=state.cartItems.filter(p=>p.available&&state.selected.has(p.id)).map(p=>p.id);if(!ids.length)return toast('Pilih barang terlebih dahulu.');newCheckout(ids);await navigate('/checkout');}
function addressCopy(a){return `<strong>${esc(a.recipient)}</strong> · ${esc(a.phone)}<p>${esc(a.detail)}, ${esc(a.district)}, ${esc(a.city)}, ${esc(a.province)} ${esc(a.postal_code)}</p>`;}
async function loadCheckout(){
 if(!await requireLogin())return;
 if(!state.checkout){try{state.checkout=JSON.parse(sessionStorage.getItem('secondinCheckout')||'null');}catch{}}
 if(!state.checkout?.product_ids?.length){$('checkoutContent').innerHTML=empty('Belum ada barang dipilih. Buka keranjang atau klik Beli sekarang dari halaman barang.');return;}
 const version=++quoteVersion;const {addresses}=await api('/addresses');state.addresses=addresses;
 if(!addresses.some(a=>a.id===state.checkout.address_id))state.checkout.address_id=addresses[0]?.id||0;
 const q=await send('/checkout/quote','POST',state.checkout);if(version!==quoteVersion)return;rememberCheckout();
 $('checkoutContent').innerHTML=`<div class="si5-two-col"><div><section class="si-panel"><div class="si5-panel-head"><h3>Alamat pengiriman</h3><button class="si5-text-button" data-action="new-address">+ Alamat baru</button></div>${addresses.length?addresses.map(a=>`<label class="si5-address-option"><input type="radio" name="checkout_address" value="${a.id}" ${a.id===state.checkout.address_id?'checked':''}><span class="si5-address-copy"><span class="si5-status">${esc(a.label)}</span> ${addressCopy(a)}</span></label>`).join(''):empty('Tambahkan alamat untuk melanjutkan checkout.')}</section>${q.groups.map(g=>`<section class="si-panel"><div class="si5-panel-head"><h3>${esc(g.seller_name)}</h3><small class="si-muted">${esc(g.origin||'Lokasi penjual belum diisi')}</small></div>${g.items.map(p=>itemLine(p)+(p.offer_id?`<p class="si5-note">Harga nego dipakai · harga awal ${rupiah(p.original_price)}</p>`:'')).join('')}<div class="si5-shipping-choices">${g.services.map(s=>`<label class="si5-radio-option"><input type="radio" name="shipping_${g.seller_id}" data-shipping-seller="${g.seller_id}" value="${s.code}" ${s.code===g.shipping_code?'checked':''}><span><strong>${s.name}</strong><small>Estimasi ${s.days}</small>${rupiah(s.cost)}</span></label>`).join('')}</div></section>`).join('')}<section class="si-panel"><h3>Catatan untuk penjual</h3><div class="field" style="margin-top:15px"><label class="sr-only" for="checkoutNote">Catatan</label><textarea id="checkoutNote" maxlength="500" placeholder="Contoh: Tolong bungkus dengan rapi, ya.">${esc(state.checkout.note||'')}</textarea></div></section></div><aside class="si-panel si5-summary"><h3>Ringkasan pembayaran</h3><div class="si5-totals">${totals(q)}</div><h3>Metode pembayaran</h3><div class="si5-payment-options">${[['bank_transfer','Transfer bank'],['qris','QRIS'],['ewallet','Dompet digital']].map(([id,name])=>`<label class="si5-radio-option"><input type="radio" name="payment_method" value="${id}" ${state.checkout.payment_method===id?'checked':''}><span>${name}</span></label>`).join('')}</div><div class="si5-simulation">Mode simulasi. Tidak ada uang yang ditagih; ongkir adalah estimasi proyek, bukan tarif kurir langsung.</div><button class="primary-btn si5-wide" id="createOrderButton" ${addresses.length?'':'disabled'}>Buat pesanan · ${rupiah(q.total)}</button><p class="si5-note">Barang disimpan selama 30 menit untuk menyelesaikan pembayaran.</p></aside></div>`;
}
async function createOrder(button){if(!state.checkout?.address_id)return toast('Pilih alamat terlebih dahulu.');await busy(button,async()=>{const data=await send('/orders','POST',state.checkout);state.checkout=null;rememberCheckout();state.selectionReady=false;await updateCounts();await navigate('/pembayaran?orders='+data.orderIds.join(','));});}
async function loadPayment(ids){
 if(!await requireLogin())return;
 const values=String(ids||'').split(',').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,50);
 if(!values.length){$('paymentContent').innerHTML=empty('Tidak ada pesanan untuk dibayar. Buka halaman Pembelian.');return;}
 const orders=await Promise.all(values.map(id=>api('/orders/'+id).then(d=>d.order)));
 $('paymentContent').innerHTML=`<div class="si5-payment-card"><div class="si5-simulation"><strong>Simulasi pembayaran SECOND IN</strong><br>Referensi di bawah bukan nomor rekening, VA, atau QR pembayaran sungguhan. Gunakan tombol simulasi untuk mencoba alur pesanan.</div>${orders.map(o=>`<section class="si-panel"><div class="si5-panel-head"><h3>${esc(o.reference)}</h3>${pill(o.status)}</div><p>Penjual: ${esc(o.seller_name)}</p><div class="si5-totals">${totals(o)}</div><p>Metode: ${esc({bank_transfer:'Transfer bank',qris:'QRIS',ewallet:'Dompet digital'}[o.payment_method])}</p><div class="si5-payment-code">SIM-${esc(o.reference)}</div>${o.status==='Menunggu pembayaran'?`<p class="si5-note">Batas pembayaran: ${date(o.expires_at)} WIB</p><button class="primary-btn si5-wide" data-pay="${o.id}">Simulasikan pembayaran berhasil</button>`:`<a class="primary-btn" data-route href="/pesanan?id=${o.id}">Lihat pesanan</a>`}</section>`).join('')}<a class="si5-text-link" data-route href="/pesanan">Lihat semua pembelian →</a></div>`;
}
function orderActions(o,seller=false){
 let buttons=[];const button=(action,label)=>`<button class="reset-filter" data-order-action="${action}" data-order-id="${o.id}">${label}</button>`;
 if(!seller&&o.status==='Menunggu pembayaran')buttons.push(`<a class="primary-btn" data-route href="/pembayaran?orders=${o.id}">Bayar sekarang</a>`);
 if(seller&&o.status==='Diproses')buttons.push(button('ship','Masukkan resi'));
 if(seller&&o.status==='Menunggu konfirmasi')buttons.push(button('Diproses','Konfirmasi pesanan'));
 if(!seller&&o.status==='Dikirim')buttons.push(button('arrived','Paket sudah tiba'));
 if(!seller&&['Dikirim','Diterima'].includes(o.status))buttons.push(button('complete','Selesaikan pesanan'));
 if(['Menunggu pembayaran','Menunggu konfirmasi','Diproses'].includes(o.status))buttons.push(button('cancel','Batalkan'));
 if(!seller&&['Diproses','Dikirim','Diterima'].includes(o.status))buttons.push(button('dispute','Ajukan kendala'));
 if(o.status==='Dalam diskusi')buttons.push(button(seller?'refund':'withdraw_dispute',seller?'Setujui pengembalian':'Tutup kendala'));
 if(!seller&&o.status==='Selesai'&&!o.review)buttons.push(button('review','Beri ulasan'));
 if(o.items.length)buttons.push(`<button class="si5-text-button" data-chat="${o.items[0].product_id}" ${seller?`data-buyer="${o.buyer_id}"`:''}>Chat ${seller?'pembeli':'penjual'}</button>`);
 return buttons.join('');
}
function orderCard(o,seller=false){return `<article class="si5-order-card" data-order-card="${o.id}"><div class="si5-panel-head"><div><strong>${esc(o.reference)}</strong><p class="si5-note">${date(o.created_at)} WIB · ${seller?'Pembeli: '+esc(o.buyer_name):'Penjual: '+esc(o.seller_name||'SECOND IN')}</p></div>${pill(o.status)}</div>${o.items.map(p=>itemLine(p)).join('')}<div class="si5-totals">${totals(o)}</div>${o.tracking_number?`<p><strong>Resi: ${esc(o.tracking_number)}</strong> · ${esc(o.shipping_code)}</p><p class="si5-note">Resi dicatat penjual; status kurir eksternal belum tersambung.</p>`:''}${o.dispute_reason?`<div class="si5-simulation"><strong>Kendala pembeli</strong><br>${esc(o.dispute_reason)}</div>`:''}<details><summary>Alamat dan catatan pengiriman</summary><div class="si5-address-copy">${o.address.recipient?addressCopy(o.address):'Alamat belum tercatat untuk pesanan versi sebelumnya.'}${o.note?`<p>Catatan: ${esc(o.note)}</p>`:''}</div></details><details><summary>Riwayat pesanan</summary><ol class="si5-timeline">${o.events.map(e=>`<li><strong>${esc(e.status)}</strong><small>${date(e.created_at)} WIB</small>${esc(e.note)}</li>`).join('')}</ol></details>${o.review?`<p class="si5-note">Ulasanmu: ${o.review.rating}/5 · ${esc(o.review.body)}</p>`:''}<div class="si5-actions">${orderActions(o,seller)}</div></article>`;}
async function loadOrders(){
 if(!state.user){$('myOrders').innerHTML=empty('Masuk ke akun untuk melihat pesananmu.');return;}
 const id=Number(new URLSearchParams(location.search).get('id'));const d=id?{orders:[(await api('/orders/'+id)).order]}:await api('/orders');
 const filtered=d.orders.filter(o=>state.orderFilter==='all'||o.status===state.orderFilter);
 $('myOrders').innerHTML=filtered.length?filtered.map(o=>orderCard(o,o.seller_id===state.user.id)).join(''):empty('Belum ada pesanan pada status ini.');
 $$('[data-order-filter]').forEach(b=>b.classList.toggle('active',b.dataset.orderFilter===state.orderFilter));
}
async function loadAccount(mode='login'){
 $('authArea').hidden=!!state.user;$('loggedInArea').hidden=!state.user;$('accountPageTitle').hidden=!state.user;
 $('loginPanel').hidden=mode==='register';$('registerPanel').hidden=mode!=='register';
 for(const id of ['loginError','registerError','loginNotice','registerNotice']){$(id).hidden=true;$(id).textContent='';}
 if(!state.user){await setupGoogleButtons(mode==='register'?'googleRegisterSlot':'googleLoginSlot');return;}
 renderProfilePhoto();
 $('googleLinkStatus').textContent=state.user.google_linked?'Akun Google sudah terhubung.':'Hubungkan akun Google untuk masuk tanpa mengetik password.';$('googleLinkSlot').hidden=!!state.user.google_linked;
 $('accountName').textContent=state.user.name;$('accountEmail').textContent=state.user.email;
 for(const [id,key] of [['profileName','name'],['profilePhone','phone'],['profileCity','city'],['profileBio','bio']])$(id).value=state.user[key]||'';
 await updateCounts();if(state.user&&!state.user.google_linked)await setupGoogleButtons('googleLinkSlot');
}
async function loadMyProducts(){
 if(!state.user){$('myProducts').innerHTML='';$('myProductsEmpty').textContent='Masuk untuk memasang dan mengelola barang.';$('sellerSummary').innerHTML='';$('sellerOrders').innerHTML=empty('Pesanan masuk akan muncul setelah kamu masuk.');return;}
 const [d,s,summary]=await Promise.all([api('/products/my'),api('/sales'),api('/seller-summary')]);
 $('sellerSummary').innerHTML=[['Barang tersedia',summary.active_products],['Pesanan selesai',summary.completed],['Pendapatan barang',rupiah(summary.income)]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');
 $('sellerOrders').innerHTML=s.sales.length?s.sales.map(o=>orderCard(o,true)).join(''):empty('Belum ada pesanan masuk.');
 $('myProducts').innerHTML=d.products.map(p=>`<div>${productCard(p)}<div class="si5-actions">${p.available||p.archived?`<button class="reset-filter" data-edit="${p.id}">Edit</button>${p.archived?`<button class="reset-filter" data-restore="${p.id}">Aktifkan</button>`:`<button class="si5-text-button" data-archive="${p.id}">Arsipkan</button>`}`:'<span class="si5-status">Sudah dipesan</span>'}</div></div>`).join('');
 $('myProductsEmpty').textContent=d.products.length?'':'Belum ada barang. Pasang barang lewat formulir di atas.';
}
async function uploadPhoto(file){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024)throw Error('Pakai foto JPG/PNG dengan ukuran maksimal 5 MB.');
 const body=new FormData();body.append('image',file);return (await api('/upload-image',{method:'POST',body})).url;
}
function resetListing(){state.editing=null;$('sellForm').reset();$('sellFormTitle').textContent='Pasang barang';$('sellForm').querySelector('[type=submit]').textContent='Posting barang';}
async function editListing(id){
 const {product:p}=await api('/products/'+id);state.editing=p;
 for(const name of ['name','price','category','condition','description','brand','size','color'])$('sellForm').elements[name].value=p[name]||'';
 $('sellFormTitle').textContent='Edit barang';$('sellForm').querySelector('[type=submit]').textContent='Simpan perubahan';$('sellForm').scrollIntoView({behavior:'smooth'});toast('Foto boleh dibiarkan kosong jika tidak diganti.');
}
async function submitListing(form){
 if(!await requireLogin())return;const files=[...$('sellImageFile').files];if(files.length>5)return toast('Pilih maksimal 5 foto.');if(!state.editing&&!files.length)return toast('Pilih setidaknya satu foto.');
 await busy(form.querySelector('[type=submit]'),async()=>{
  const data=Object.fromEntries(new FormData(form));delete data.image_file;data.price=Number(data.price);
  data.photos=files.length?await Promise.all(files.map(uploadPhoto)):state.editing.photos;
  await send('/products'+(state.editing?'/'+state.editing.id:''),state.editing?'PATCH':'POST',data);
  resetListing();await loadMyProducts();await refreshProducts();await loadCatalogOptions();toast('Barang berhasil disimpan.');
 });
}
function showModal(title,html,onSubmit){
 modalFocus=document.activeElement;state.modalSubmit=onSubmit;$('actionTitle').textContent=title;$('actionContent').innerHTML=html;$('actionModal').hidden=false;$('actionModal').classList.add('open');document.body.style.overflow='hidden';$('actionContent').querySelector('input,textarea,button')?.focus();
}
function closeModal(){if(!$('actionModal'))return;$('actionModal').classList.remove('open');$('actionModal').hidden=true;document.body.style.overflow='';state.modalSubmit=null;$('actionContent').innerHTML='';modalFocus?.focus();}
function addressForm(a={}){
 showModal(a.id?'Edit alamat':'Alamat baru',`<form id="actionForm" class="si-form"><div class="form-grid">${field('Label alamat','label',a.label||'Rumah','text','required maxlength="40"')}${field('Nama penerima','recipient',a.recipient||state.user?.name||'','text','required maxlength="80"')}${field('Nomor HP','phone',a.phone||state.user?.phone||'','tel','required minlength="8" maxlength="20"')}${field('Provinsi','province',a.province,'text','required maxlength="80"')}${field('Kota / kabupaten','city',a.city,'text','required maxlength="80"')}${field('Kecamatan','district',a.district,'text','required maxlength="80"')}${field('Kode pos','postal_code',a.postal_code,'text','required pattern="[0-9]{5}" maxlength="5" inputmode="numeric"')}<div class="field full"><label>Alamat lengkap<textarea name="detail" required minlength="10" maxlength="500" placeholder="Nama jalan, nomor rumah, RT/RW, patokan">${esc(a.detail||'')}</textarea></label></div></div><label class="si5-check-all"><input name="is_default" type="checkbox" ${a.is_default||!state.addresses.length?'checked':''}> Jadikan alamat utama</label><button class="primary-btn" type="submit">Simpan alamat</button></form>`,async form=>{
  const data=Object.fromEntries(new FormData(form));data.is_default=form.elements.is_default.checked;
  const r=await send('/addresses'+(a.id?'/'+a.id:''),a.id?'PATCH':'POST',data);closeModal();
  if(state.checkout)state.checkout.address_id=r.id;
  if(location.pathname==='/checkout')await loadCheckout();else await loadAddresses();toast('Alamat tersimpan.');
 });
}
async function loadAddresses(){if(!state.user){$('addressList').innerHTML=empty('Masuk dulu untuk menyimpan alamat.');return;}const d=await api('/addresses');state.addresses=d.addresses;$('addressList').innerHTML=d.addresses.length?d.addresses.map(a=>`<article class="si-panel"><div class="si5-panel-head"><h3>${esc(a.label)}</h3>${a.is_default?'<span class="si5-status">Utama</span>':''}</div><div class="si5-address-copy">${addressCopy(a)}</div><div class="si5-actions"><button class="reset-filter" data-address-edit="${a.id}">Edit</button><button class="si5-text-button" data-address-delete="${a.id}">Hapus</button></div></article>`).join(''):empty('Belum ada alamat. Tambahkan alamat pengirimanmu.');}
async function orderAction(id,action){
 const {order:o}=await api('/orders/'+id);
 const refresh=async()=>{if(location.pathname==='/jual')await loadMyProducts();else await loadOrders();await updateCounts();};
 if(action==='review'){
  showModal('Bagaimana barangnya?',`<form id="actionForm" class="si-form"><div class="field"><label>Nilai penjual<select name="rating" required>${[5,4,3,2,1].map(n=>`<option value="${n}">${n} bintang</option>`).join('')}</select></label></div><div class="field"><label>Ulasan<textarea name="body" required minlength="5" maxlength="1000" placeholder="Ceritakan kondisi barang dan pengalamanmu."></textarea></label></div><button class="primary-btn" type="submit">Kirim ulasan</button></form>`,async form=>{const v=Object.fromEntries(new FormData(form));await send('/reviews','POST',{order_id:id,rating:Number(v.rating),body:v.body});closeModal();await refresh();toast('Terima kasih, ulasanmu sudah tersimpan.');});return;
 }
 const promptFields=action==='ship'?field('Nomor resi','tracking_number','','text','required maxlength="80" placeholder="Masukkan resi dari kurir"'):['cancel','dispute'].includes(action)?`<div class="field"><label>${action==='dispute'?'Ceritakan kendalamu':'Alasan pembatalan'}<textarea name="reason" required minlength="${action==='dispute'?10:5}" maxlength="1000"></textarea></label></div>`:'';
 const labels={ship:'Masukkan resi',cancel:'Batalkan pesanan',dispute:'Ajukan kendala',complete:'Selesaikan pesanan',arrived:'Paket sudah tiba',withdraw_dispute:'Tutup kendala',refund:'Setujui pengembalian',Diproses:'Konfirmasi pesanan'};
 const note=action==='complete'?'Pastikan barang sudah diterima dan sesuai. Setelah selesai, kamu bisa memberi ulasan.':action==='refund'?'Pengembalian pembayaran dicatat sebagai simulasi. Sepakati pengembalian barang lewat chat.':action==='ship'?'Nomor resi dicatat pada pesanan. Kurir belum terhubung secara otomatis.':'Perubahan ini akan dicatat di riwayat pesanan.';
 showModal(labels[action],`<form id="actionForm" class="si-form"><p class="form-hint si5-note">${note}</p>${promptFields}<button class="primary-btn" type="submit">${labels[action]}</button></form>`,async form=>{await send('/orders/'+id,'PATCH',{action,...Object.fromEntries(new FormData(form))});closeModal();await refresh();toast('Pesanan diperbarui.');});
}
async function chatSeller(id,buyer=null,negotiate=false){
 if(!await requireLogin())return;const {product:p}=await api('/products/'+id);
 if(p.seller_id===state.user.id&&!buyer){toast('Buka percakapan pembeli dari kotak pesan.');await navigate('/pesan');return;}
 state.conversation={productId:id,buyerId:buyer||state.user.id,productName:p.name,sellerId:p.seller_id};
 await navigate('/pesan');if(negotiate)await offerForm();
}
async function loadThreads(){
 if(!state.user){$('threadList').innerHTML=empty('Masuk untuk mulai chat.');$('messageList').innerHTML='';return;}
 const d=await api('/conversations');$('threadList').innerHTML=d.conversations.length?d.conversations.map(t=>`<button class="si-thread ${state.conversation?.productId===t.product_id&&state.conversation?.buyerId===t.buyer_id?'active':''}" data-thread-product="${t.product_id}" data-thread-buyer="${t.buyer_id}" data-thread-seller="${t.seller_id}"><strong>${esc(t.product_name)}</strong><small>${esc(t.seller_id===state.user.id?t.buyer_name:t.seller_name)}</small><small>${esc(t.last_message)}</small></button>`).join(''):empty('Belum ada obrolan. Mulai dari halaman barang.');
 if(state.conversation)await loadMessages();
}
async function loadMessages(){
 const c=state.conversation;if(!c||!state.user)return;
 const params=new URLSearchParams({productId:c.productId,buyerId:c.buyerId});const [d,f]=await Promise.all([api('/messages?'+params),api('/offers?'+params)]);
 if(state.conversation!==c)return;
 $('conversationTitle').innerHTML=`<a data-route href="/barang?id=${c.productId}">${esc(c.productName||'Detail barang')} →</a>`;$('conversationPartner').textContent=c.sellerId===state.user.id?'Percakapan dengan pembeli':'Percakapan dengan penjual';$('offerButton').hidden=c.sellerId===state.user.id;
 $('offerList').innerHTML=f.offers.slice(0,2).map(o=>`<div class="si5-offer"><strong>Tawaran ${rupiah(o.amount)}</strong> · ${esc({pending:'Menunggu respons',accepted:'Diterima',declined:'Ditolak',used:'Sudah digunakan',replaced:'Diganti tawaran baru',expired:'Berakhir'}[o.status]||o.status)}${o.status==='accepted'?'<p>Harga berlaku saat checkout. Barang tetap tersedia untuk pembeli lain sebelum dipesan.</p>':''}${c.sellerId===state.user.id&&o.status==='pending'?`<div class="si5-actions"><button class="reset-filter" data-offer-response="accepted" data-offer-id="${o.id}">Terima</button><button class="si5-text-button" data-offer-response="declined" data-offer-id="${o.id}">Tolak</button></div>`:''}${c.sellerId!==state.user.id&&o.status==='accepted'?`<button class="reset-filter" data-buy="${c.productId}">Checkout harga ini</button>`:''}</div>`).join('');
 $('messageList').innerHTML=d.messages.length?d.messages.map(m=>`<div class="si-message ${m.sender_id===state.user.id?'mine':''}">${esc(m.body)}<small>${esc(m.sender_name)} · ${date(m.created_at)} WIB</small></div>`).join(''):empty('Belum ada pesan. Sapa penjual dan tanyakan detail barang.');$('messageList').scrollTop=$('messageList').scrollHeight;
}
async function sendChat(form){if(!state.conversation)return toast('Pilih percakapan atau buka chat dari halaman barang.');const body=$('chatText').value.trim();if(!body)return;await busy(form.querySelector('[type=submit]'),async()=>{await send('/messages','POST',{productId:state.conversation.productId,buyerId:state.conversation.buyerId,body});$('chatText').value='';await loadThreads();});}
async function offerForm(){if(!state.conversation)return;const {product:p}=await api('/products/'+state.conversation.productId);showModal('Ajukan harga',`<form id="actionForm" class="si-form"><p>Harga barang: <strong>${rupiah(p.price)}</strong></p>${field('Tawaranmu (Rp)','amount','','number',`required min="1000" max="${p.price-1}" step="1"`)}<p class="si5-note">Tawaran tidak menyimpan stok. Lanjutkan checkout setelah penjual menyetujui hargamu.</p><button class="primary-btn" type="submit">Kirim tawaran</button></form>`,async form=>{await send('/offers','POST',{product_id:p.id,amount:Number(form.elements.amount.value)});closeModal();await loadThreads();toast('Tawaran terkirim.');});}
async function loadNotifications(){if(!state.user){$('notificationList').innerHTML=empty('Masuk untuk melihat notifikasi.');return;}const d=await api('/notifications');$('notificationList').innerHTML=d.notifications.length?d.notifications.map(n=>`<article class="si5-notice ${n.seen?'':'unread'}"><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${date(n.created_at)} WIB</small>${n.order_id?`<a class="si5-text-link" data-route href="/pesanan?id=${n.order_id}">Lihat pesanan →</a>`:''}</article>`).join(''):empty('Belum ada notifikasi. Kabar pesanan dan tawaranmu akan muncul di sini.');await updateCounts();}
function authMessage(id,message){$(id).textContent=message;$(id).hidden=false;}
function updateAccountLink(){const link=$('navAccountLink');link.textContent=state.user?'Akun':'Masuk';link.href=state.user?'/akun':'/masuk';link.title=link.textContent;link.setAttribute('aria-label',link.textContent);}
async function loginOrRegister(form,endpoint){
 const registering=endpoint==='/register',errorId=registering?'registerError':'loginError';$(errorId).hidden=true;
 if(registering&&form.elements.password.value!==form.elements.password_confirm.value){authMessage(errorId,'Password yang kamu ulangi belum sama.');form.elements.password_confirm.focus();return;}
 await busy(form.querySelector('[type=submit]'),async()=>{
  const payload=Object.fromEntries(new FormData(form));delete payload.password_confirm;
  try{
   const data=await send(endpoint,'POST',payload);state.user=data.user;state.selectionReady=false;form.reset();updateAccountLink();await updateCounts();
   let redirect=sessionStorage.getItem('secondinReturn')||'/akun';sessionStorage.removeItem('secondinReturn');
   if(!redirect.startsWith('/')||redirect.startsWith('//')||['/masuk','/daftar'].includes(redirect.split('?')[0]))redirect='/akun';
   await navigate(redirect);toast(registering?'Pendaftaran berhasil. Selamat datang, '+data.user.name+'!':'Halo, '+data.user.name+'!');
  }catch(error){
   form.elements.password.value='';
   if(!registering&&error.code==='ACCOUNT_NOT_FOUND'){
    await navigate('/daftar');$('registerEmail').value=payload.email;authMessage('registerNotice','Email ini belum terdaftar. Lengkapi data di bawah untuk membuat akun.');$('registerName').focus();return;
   }
   if(registering&&error.status===409){await navigate('/masuk');$('loginEmail').value=payload.email;authMessage('loginNotice','Email ini sudah terdaftar. Masuk dengan akunmu.');$('loginPassword').focus();return;}
   authMessage(errorId,error.message);
  }
 });
}
async function logout(){await send('/logout','POST');window.google?.accounts?.id?.disableAutoSelect();googleSession=null;state.user=null;state.conversation=null;state.checkout=null;state.selected.clear();state.selectionReady=false;rememberCheckout();updateAccountLink();$('threadList').innerHTML='';$('messageList').innerHTML='';$('offerList').innerHTML='';$('myOrders').innerHTML='';$('sellerOrders').innerHTML='';await updateCounts();await navigate('/beranda');toast('Sudah keluar.');}
let googleSession=null,googleScriptPromise=null,googleActiveSlot='googleLoginSlot';
function renderProfilePhoto(){if(!state.user)return;$('accountAvatar').innerHTML=avatar(state.user,'si8-avatar-inner');$('removeProfilePhoto').hidden=!state.user.avatar_url;}
async function saveProfilePhoto(input){
 const file=input.files?.[0];if(!file)return;
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024){input.value='';$('profilePhotoStatus').textContent='Pilih JPG atau PNG, maksimal 5 MB.';return;}
 input.disabled=true;$('photoUploadLabel').setAttribute('aria-disabled','true');$('profilePhotoStatus').textContent='Mengunggah foto…';
 try{const body=new FormData();body.append('image',file);const d=await api('/profile/photo',{method:'POST',body});state.user=d.user;renderProfilePhoto();$('profilePhotoStatus').textContent='Foto profil disimpan.';}
 catch(error){$('profilePhotoStatus').textContent=error.message;}
 finally{input.disabled=false;input.value='';$('photoUploadLabel').removeAttribute('aria-disabled');}
}
function loadGoogleScript(){
 if(window.google?.accounts?.id)return Promise.resolve();
 if(!googleScriptPromise)googleScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client?hl=id';script.async=true;script.onload=()=>resolve();script.onerror=()=>{googleScriptPromise=null;script.remove();reject(Error('Google belum dapat dimuat. Coba muat ulang halaman.'));};document.head.append(script);});
 return googleScriptPromise;
}
async function setupGoogleButtons(slotId){
 const slot=$(slotId);if(!slot)return;
 try{
  const config=await api('/auth/config');
  if(!config.google_enabled){slot.innerHTML='<button class="si8-google-fallback" type="button" disabled>Lanjutkan dengan Google</button><p class="si5-note">Login Google belum tersedia. Gunakan email untuk masuk.</p>';return;}
  slot.innerHTML='<p class="si5-note">Memuat Google…</p>';
  await loadGoogleScript();
  if(!googleSession||Date.now()-googleSession.created>8*60*1000){const d=await send('/auth/google/nonce','POST');googleSession={nonce:d.nonce,created:Date.now()};window.google.accounts.id.initialize({client_id:config.google_client_id,nonce:d.nonce,auto_select:false,ux_mode:'popup',callback:handleGoogleCredential});}
  slot.innerHTML='';window.google.accounts.id.renderButton(slot,{type:'standard',theme:'outline',size:'large',shape:'rectangular',text:slotId==='googleRegisterSlot'?'signup_with':'continue_with',width:Math.max(220,Math.min(380,slot.clientWidth||300)),locale:'id',click_listener:()=>{googleActiveSlot=slotId;}});
 }catch(error){slot.innerHTML=`<p class="si5-note">${esc(error.message)}</p>`;}
}
async function handleGoogleCredential(response){
 const linked=!!state.user,slot=$(googleActiveSlot),status=slot?.parentElement?.querySelector('.si8-google-status');
 if(status)status.textContent='Memproses login Google…';
 try{
  const d=await send('/auth/google','POST',{credential:response.credential});state.user=d.user;googleSession=null;state.selectionReady=false;updateAccountLink();await updateCounts();
  let redirect=linked?'/akun':sessionStorage.getItem('secondinReturn')||'/akun';sessionStorage.removeItem('secondinReturn');
  if(!redirect.startsWith('/')||redirect.startsWith('//')||['/masuk','/daftar'].includes(redirect.split('?')[0]))redirect='/akun';
  await navigate(redirect);toast(linked?'Akun Google berhasil dihubungkan.':'Berhasil masuk.');
 }catch(error){googleSession=null;if(status)status.textContent=error.message;else toast(error.message);await setupGoogleButtons(googleActiveSlot);}
}
function events(){
 document.addEventListener('click',event=>attempt(async()=>{
  const target=event.target;
  const reveal=target.closest('[data-toggle-password]');if(reveal){const input=$(reveal.dataset.togglePassword),show=input.type==='password';input.type=show?'text':'password';reveal.textContent=show?'Sembunyikan':'Lihat';reveal.setAttribute('aria-pressed',String(show));reveal.setAttribute('aria-label',show?'Sembunyikan password':'Tampilkan password');return;}
  const link=target.closest('a[data-route]');if(link){event.preventDefault();await navigate(link.getAttribute('href'));return;}
  if(target.closest('[data-action=clear-recent]')){sessionStorage.removeItem('secondinViewed');renderRecent();return;}
  if(target.closest('[data-action=remove-avatar]')){await busy($('removeProfilePhoto'),async()=>{const d=await api('/profile/photo',{method:'DELETE'});state.user=d.user;renderProfilePhoto();$('profilePhotoStatus').textContent='Foto profil dihapus.';});return;}
  const homeSort=target.closest('[data-home-sort]');if(homeSort){state.homeSort=homeSort.dataset.homeSort;renderHomeProducts();return;}
  const category=target.closest('.category[data-search-category]');if(category){await navigate('/jelajahi?category='+encodeURIComponent(category.dataset.searchCategory));return;}
  const filter=target.closest('[data-filter]');if(filter){state.category=filter.dataset.filter;$$('#categoryFilters [data-filter]').forEach(b=>{b.classList.toggle('active',b===filter);b.setAttribute('aria-pressed',String(b===filter));});await collectBrowseFilters();return;}
  const buy=target.closest('[data-buy]');if(buy){await buyNow(Number(buy.dataset.buy));return;}
  const add=target.closest('[data-add]');if(add){await addCart(Number(add.dataset.add));return;}
  const wish=target.closest('[data-wish]');if(wish){await toggleWish(Number(wish.dataset.wish));return;}
  const chat=target.closest('[data-chat]');if(chat){await chatSeller(Number(chat.dataset.chat),Number(chat.dataset.buyer)||null);return;}
  const nego=target.closest('[data-negotiate]');if(nego){await chatSeller(Number(nego.dataset.negotiate),null,true);return;}
  const photo=target.closest('[data-photo]');if(photo){$('galleryMain').src=photo.dataset.photo;$$('[data-photo]').forEach(b=>b.classList.toggle('active',b===photo));return;}
  const follow=target.closest('[data-follow]');if(follow){if(!await requireLogin())return;const d=await send('/sellers/'+follow.dataset.follow,'POST');follow.textContent=d.following?'Mengikuti':'Ikuti toko';return;}
  const remove=target.closest('[data-remove-cart]');if(remove){await api('/cart/'+remove.dataset.removeCart,{method:'DELETE'});state.selected.delete(Number(remove.dataset.removeCart));await updateCounts();await loadCart();return;}
  const pay=target.closest('[data-pay]');if(pay){await busy(pay,async()=>{await send('/orders/'+pay.dataset.pay+'/pay','POST',{simulation:true});await updateCounts();await loadPayment(new URLSearchParams(location.search).get('orders'));toast('Pembayaran simulasi berhasil. Penjual dapat memproses pesanan.');});return;}
  const order=target.closest('[data-order-action]');if(order){await orderAction(Number(order.dataset.orderId),order.dataset.orderAction);return;}
  const orderFilter=target.closest('[data-order-filter]');if(orderFilter){state.orderFilter=orderFilter.dataset.orderFilter;history.replaceState({},'','/pesanan?status='+encodeURIComponent(state.orderFilter));await loadOrders();return;}
  const edit=target.closest('[data-edit]');if(edit){await editListing(Number(edit.dataset.edit));return;}
  const archive=target.closest('[data-archive]');if(archive){showModal('Arsipkan barang',`<form id="actionForm"><p>Barang tidak akan muncul di katalog. Kamu bisa mengaktifkannya lagi nanti.</p><button class="primary-btn" type="submit">Arsipkan</button></form>`,async()=>{await api('/products/'+archive.dataset.archive,{method:'DELETE'});closeModal();await loadMyProducts();toast('Barang diarsipkan.');});return;}
  const restore=target.closest('[data-restore]');if(restore){const {product:p}=await api('/products/'+restore.dataset.restore);await send('/products/'+p.id,'PATCH',{...p,archived:false});await loadMyProducts();toast('Barang aktif lagi.');return;}
  const addressEdit=target.closest('[data-address-edit]');if(addressEdit){addressForm(state.addresses.find(a=>a.id===Number(addressEdit.dataset.addressEdit)));return;}
  const addressDelete=target.closest('[data-address-delete]');if(addressDelete){showModal('Hapus alamat',`<form id="actionForm"><p>Hapus alamat tersimpan ini? Alamat pada pesanan sebelumnya tetap tercatat.</p><button class="primary-btn" type="submit">Hapus alamat</button></form>`,async()=>{await api('/addresses/'+addressDelete.dataset.addressDelete,{method:'DELETE'});closeModal();await loadAddresses();});return;}
  const thread=target.closest('[data-thread-product]');if(thread){const {product:p}=await api('/products/'+thread.dataset.threadProduct);state.conversation={productId:p.id,buyerId:Number(thread.dataset.threadBuyer),sellerId:p.seller_id,productName:p.name};await loadThreads();return;}
  const response=target.closest('[data-offer-response]');if(response){await send('/offers/'+response.dataset.offerId,'PATCH',{status:response.dataset.offerResponse});await loadThreads();return;}
  if(target.closest('#createOrderButton')){await createOrder($('createOrderButton'));return;}
  const action=target.closest('[data-action]')?.dataset.action;
  if(action==='close-modal'||target===$('actionModal'))closeModal();
  if(action==='new-address'){if(await requireLogin())addressForm();}
  if(action==='refresh-orders')await loadOrders();
  if(action==='refresh-sales')await loadMyProducts();
  if(action==='refresh-threads')await loadThreads();
  if(action==='reset-listing')resetListing();
  if(action==='read-notices'){if(!await requireLogin())return;await send('/notifications','PATCH');await loadNotifications();}
 }));
 document.addEventListener('change',event=>attempt(async()=>{
  const el=event.target;
  if(el.id==='profilePhoto'){await saveProfilePhoto(el);return;}
  if(el.matches('[data-cart-check]')){el.checked?state.selected.add(Number(el.dataset.cartCheck)):state.selected.delete(Number(el.dataset.cartCheck));updateCartSummary();}
  if(el===$('cartSelectAll')){state.selected=new Set(el.checked?state.cartItems.filter(p=>p.available).map(p=>p.id):[]);$$('[data-cart-check]').forEach(b=>b.checked=state.selected.has(Number(b.dataset.cartCheck)));updateCartSummary();}
  if(el.name==='checkout_address'){state.checkout.address_id=Number(el.value);rememberCheckout();await loadCheckout();}
  if(el.dataset.shippingSeller){state.checkout.shipping[el.dataset.shippingSeller]=el.value;rememberCheckout();await loadCheckout();}
  if(el.name==='payment_method'){state.checkout.payment_method=el.value;rememberCheckout();}
 }));
 document.addEventListener('input',event=>{if(event.target.id==='checkoutNote'&&state.checkout){state.checkout.note=event.target.value;rememberCheckout();}});
 document.addEventListener('submit',event=>{
  if(!['loginForm','registerForm','sellForm','profileForm','chatForm','actionForm'].includes(event.target.id))return;
  event.preventDefault();const form=event.target;
  attempt(async()=>{
   if(form.id==='loginForm'||form.id==='registerForm')await loginOrRegister(form,form.id==='loginForm'?'/login':'/register');
   if(form.id==='sellForm'){await submitListing(form);form.querySelector('[type=submit]').textContent=state.editing?'Simpan perubahan':'Posting barang';}
   if(form.id==='profileForm')await busy(form.querySelector('[type=submit]'),async()=>{const d=await send('/profile','PATCH',Object.fromEntries(new FormData(form)));state.user=d.user;await loadAccount();toast('Profil disimpan.');});
   if(form.id==='chatForm')await sendChat(form);
   if(form.id==='actionForm'&&state.modalSubmit)await busy(form.querySelector('[type=submit]'),()=>state.modalSubmit(form));
  });
 });
 $('menuToggle').addEventListener('click',()=>{const open=$('mobileMenu').classList.toggle('open');$('menuToggle').setAttribute('aria-expanded',String(open));});
 $('searchButton').addEventListener('click',()=>navigate('/jelajahi?q='+encodeURIComponent($('searchInput').value.trim())));
 $('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')navigate('/jelajahi?q='+encodeURIComponent(e.target.value.trim()));});
 $('browseSearch').addEventListener('click',()=>attempt(collectBrowseFilters));
 $('browseInput').addEventListener('keydown',e=>{if(e.key==='Enter')attempt(collectBrowseFilters);});
 ['conditionFilter','sortProducts','brandFilter','sizeFilter','availabilityFilter'].forEach(id=>$(id).addEventListener('change',()=>attempt(collectBrowseFilters)));
 ['minPrice','maxPrice','cityFilter'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(filterTimer);filterTimer=setTimeout(()=>attempt(collectBrowseFilters),250);}));
 $('resetFilters').addEventListener('click',()=>{clearTimeout(filterTimer);syncBrowse(new URLSearchParams());history.replaceState({},'','/jelajahi');attempt(loadBrowse);});
 $('sellButton').addEventListener('click',()=>navigate('/jual'));
 $('checkoutButton').addEventListener('click',()=>attempt(startCheckout));
 $('logoutButton').addEventListener('click',()=>attempt(logout));
 $('offerButton').addEventListener('click',()=>attempt(offerForm));
 window.addEventListener('popstate',()=>navigate(location.pathname+location.search,false));
 window.addEventListener('scroll',()=>$('navbar').classList.toggle('scrolled',scrollY>20),{passive:true});
 document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&!e.target.src.endsWith('/fallback.svg'))e.target.src='/fallback.svg';},true);
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();$('mobileMenu').classList.remove('open');}
  if(e.key==='Tab'&&!$('actionModal').hidden){const items=[...$('actionModal').querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 });
}
(async()=>{
 events();
 if(location.protocol==='file:'){toast('Jalankan JALANKAN_WINDOWS.bat dan gunakan tab yang dibuka otomatis.');return;}
 await attempt(async()=>{const version=await api('/build');if(version.revision!=='etp5-profile-google-20261020-r8')throw Error('Versi server tidak sesuai. Jalankan JALANKAN_WINDOWS.bat dari folder ETP #5 terbaru.');state.user=(await api('/me')).user;updateAccountLink();await updateCounts();await loadCatalogOptions();});
 await navigate(location.pathname==='/'?'/beranda':location.pathname+location.search,false);
})();
