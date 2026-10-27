import { AVATARS } from '../engine/humans.js';
import { esc } from '../api.js';
import { connectVircadia } from '../net/vircadia.js';

export function openVircadia(ctx) {
  const local=["localhost","127.0.0.1"].includes(location.hostname);
  let saved;try{saved=JSON.parse(localStorage.getItem('vmatrimony:domain')||'null');}catch{saved=null;}
  let active;try{active=JSON.parse(sessionStorage.getItem('vmatrimony:native-active')||'null');}catch{active=null;}
  const address=new URLSearchParams(location.search).get('domain')||active?.address||saved?.address||(local?'ws://127.0.0.1:40102':'');
  const el=ctx.openSheet(`<h2>Vircadia native domain</h2><p>Join the same venue as native Vircadia guests. Choose your outfit and enter the domain address provided by your host.</p><label class="field">Domain WebSocket URL<input id="vc-url" value="${esc(address)}" placeholder="wss://ceremony.example.com:40102"></label><label class="field">Display name<input id="vc-name" value="Wedding browser" maxlength="24"></label><label class="field">Your outfit<select id="vc-look">${AVATARS.map((a,i)=>`<option value="${i}">${esc(a.label)} (${a.id})</option>`).join("")}</select></label><button class="btn primary" id="vc-connect">Connect to domain</button><p id="vc-error" role="status"></p>`);
  if(active?.name)el.querySelector('#vc-name').value=active.name;
  el.querySelector('#vc-look').value=String(Math.abs(saved?.look|0)%AVATARS.length);
  el.querySelector('#vc-connect').onclick=async()=>{
    const address=el.querySelector('#vc-url').value.trim();
    const look=Number(el.querySelector('#vc-look').value);
    const name=el.querySelector('#vc-name').value.trim()||'Wedding browser';
    if(!/^wss?:\/\//.test(address)){el.querySelector('#vc-error').textContent='Enter a ws:// or wss:// domain URL.';return;}
    if(location.protocol==='https:'&&!address.startsWith('wss://')){el.querySelector('#vc-error').textContent='This hosted client needs a secure wss:// domain address.';return;}
    localStorage.setItem('vmatrimony:domain',JSON.stringify({address,look}));
    sessionStorage.setItem('vmatrimony:native-active',JSON.stringify({address,look,name}));
    el.querySelector('#vc-connect').disabled=true;
    try {
      ctx.closeSheet();ctx.world.detach();ctx.dock.innerHTML='';
      const panel=document.createElement('div');panel.className='chip';panel.style.cssText='position:fixed;top:60px;left:12px;max-width:430px;white-space:pre-wrap;pointer-events:auto;font:12px monospace;z-index:5';panel.setAttribute('role','status');document.body.append(panel);
      const chat=document.createElement('div');chat.style.cssText='position:fixed;left:12px;bottom:80px;max-width:400px;background:#fff9;padding:8px;pointer-events:none';document.body.append(chat);
      // guests see a one-line status; ?diag shows the full connection diagnostics and test tools
      const diag=new URLSearchParams(location.search).has('diag');
      const t=await connectVircadia({world:ctx.world,address,name,look,onStatus:s=>{
        if(!diag){panel.textContent=s.domain==='CONNECTED'?'✓ Connected to the venue'+(s.remoteAvatars?' · '+s.remoteAvatars+' other guest'+(s.remoteAvatars===1?'':'s'):''):'Connecting to the venue…';return;}
        panel.textContent=`Vircadia ${s.domain}\nAvatar ${s.avatars} · Entity ${s.entities}\nMessage ${s.messages} · Audio ${s.audio}\nNative attendees: ${s.remoteAvatars} · Entities: ${s.renderedEntities}\nShared venue: ${s.sharedVenueLoaded ? 'loaded' : 'waiting'}\nOutfit: ${s.selfAvatarModel||'pending'}\nGuest outfits: ${(s.remoteAvatarModels||[]).map(u=>u.split('/').pop()||'pending').join(', ')}\nMessages: ${s.receivedMessages} · Audio peak: ${(s.receivedAudioPeak||0).toFixed(4)}\n${s.lastMessage ? JSON.stringify(s.lastMessage.message) : s.error||''}`;
      },onChat:(from,text)=>{chat.textContent=from+': '+text;}});
      let mic=false;
      const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>Promise.resolve(fn(b)).catch(e=>ctx.toast(e.message));ctx.dock.append(b);};
      button('Walk',()=>ctx.world.setMode('body'));
      button('Watch',()=>ctx.world.setMode('spectator'));
      button('Enable sound',async b=>{await t.listen();b.textContent='Sound enabled';});
      button('Microphone off',async b=>{await t.microphone(!mic);mic=!mic;b.textContent=mic?'Microphone on':'Microphone off';});
      button('Chat',()=>{const sheet=ctx.openSheet('<h2>Domain chat</h2><form id="vc-chat"><input aria-label="Message" maxlength="200"><button class="btn primary">Send</button></form>');sheet.querySelector('form').onsubmit=e=>{e.preventDefault();t.chat(sheet.querySelector('input').value);ctx.closeSheet();};});
      button('Outfit',()=>{const sheet=ctx.openSheet('<h2>Your outfit</h2>'+AVATARS.map((a,i)=>`<button class="btn" data-outfit="${i}">${esc(a.label)}</button>`).join(''));sheet.querySelectorAll('[data-outfit]').forEach(b=>b.onclick=async()=>{await t.setAppearance(Number(b.dataset.outfit));ctx.closeSheet();});});
      if(diag){
        button('Send test tone',()=>t.testTone());
        button('Change test entity',()=>t.changeMarker());
        button('Near test avatar',()=>t.testDistance(true));
        button('Far from test avatar',()=>t.testDistance(false));
        button('Check native link',()=>t.probe());
      }
      button('Leave',()=>{sessionStorage.removeItem('vmatrimony:native-active');t.close();panel.remove();chat.remove();ctx.home();});
    } catch(e){sessionStorage.removeItem('vmatrimony:native-active');ctx.toast('Vircadia: '+e.message);ctx.home();}
  };
  if(active?.address===address)setTimeout(()=>el.isConnected&&el.querySelector('#vc-connect').click(),0);
}
