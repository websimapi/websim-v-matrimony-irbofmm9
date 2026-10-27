// Native-core integration. SDK is loaded only when explicitly entering a domain.
import * as THREE from 'three';
import { AVATARS } from '../engine/humans.js';
import { instance } from '../engine/assets.js';
import { CHANNEL, loadSdk, nativeAssets, uuidKey, isNullUuid, yawOf, yawQuat } from './native-common.js';

export async function connectVircadia({world, address, name, look=0, onStatus, onChat}) {
  const sdk = await loadSdk();
  const domain = new sdk.DomainServer([]);
  const camera = new sdk.Camera(domain.contextID);
  const avatars = new sdk.AvatarMixer(domain.contextID);
  const entities = new sdk.EntityServer(domain.contextID);
  const messages = new sdk.MessageMixer(domain.contextID);
  const audio = new sdk.AudioMixer(domain.contextID);
  audio.audioWorkletRelativePath = './vendor/vircadia/';
  audio.inputMuted = true;
  const output = document.createElement('audio'); output.autoplay = true; output.srcObject = audio.audioOutput;
  document.body.append(output);
  const channel = CHANNEL;
  const appearances=new Map();
  const {hips,appearanceURL,lookOf,localAsset}=await nativeAssets(address);
  const remote = new Map(), shared = new Map(), diagnostics = {sdk:sdk.Vircadia.verboseVersion,domain:'Disconnected',avatars:'Unavailable',entities:'Unavailable',messages:'Unavailable',audio:'Unavailable',receivedEntities:0,receivedMessages:0,receivedPoses:0,lastMessage:null,session:null};
  let closed = false, stream, interval, self, connectedOnce = false, meterContext, analyser, toneContext;
  const clearShared=()=>{for(const {group}of shared.values()){group.removeFromParent();if(group.userData.ownsGeometry)group.traverse(m=>{m.geometry?.dispose();m.material?.map?.dispose();m.material?.dispose?.();});}shared.clear();diagnostics.sharedVenueLoaded=false;world.venue.root.visible=true;world.venue.sky.hills.visible=true;world.venue.sky.meadow.visible=true;};
  const status = () => onStatus?.({...diagnostics,remoteAvatars:remote.size,renderedEntities:shared.size});
  const key = uuidKey;
  const audioSamples=new Float32Array(2048);
  const quat = () => {const q=new THREE.Quaternion();world.camera.getWorldQuaternion(q);return {x:q.x,y:q.y,z:q.z,w:q.w};};
  const pos = () => {const p=new THREE.Vector3();world.camera.getWorldPosition(p);return {x:p.x,y:p.y,z:p.z};};
  audio.positionGetter = pos; audio.orientationGetter = quat;
  avatars.myAvatar.displayName = name.slice(0,24);
  avatars.myAvatar.skeletonModelURL=appearanceURL(look);
  diagnostics.selfAvatarModel=avatars.myAvatar.skeletonModelURL;
  avatars.myAvatar.position = {x:0,y:0,z:8};
  domain.sessionUUIDChanged.connect(id => {self=key(id);diagnostics.session=self;status();});
  domain.onStateChanged = state => {
    diagnostics.domain=sdk.DomainServer.stateToString(state);
    diagnostics.error=domain.errorInfo || domain.refusalInfo || '';
    if(state===sdk.DomainServer.CONNECTED && !connectedOnce) {
      connectedOnce=true;
      world.handle({type:'welcome',id:self || key(domain.sessionUUID),role:'guest',players:[],poses:[],state:{}});
    }
    status();
  };
  for (const [label, client, Type] of [['avatars',avatars,sdk.AvatarMixer],['entities',entities,sdk.EntityServer],['messages',messages,sdk.MessageMixer],['audio',audio,sdk.AudioMixer]]) {
    client.onStateChanged = state => {
      diagnostics[label]=Type.stateToString(state);
      if(label==='entities'&&state!==sdk.EntityServer.CONNECTED)clearShared();
      if(label==='messages' && state===sdk.MessageMixer.CONNECTED) {messages.subscribe(channel);messages.sendMessage(channel,JSON.stringify({v:1,type:'hello',name}));}
      status();
    };
  }
  avatars.avatarList.avatarAdded.connect(id => {
    const k=key(id); if(k===self || isNullUuid(k))return;
    remote.set(k,id);
    const a=avatars.avatarList.getAvatar(id);
    world.handle({type:'join',player:{id:k,name:a.sessionDisplayName || 'Vircadia attendee',look:0,mode:'body',role:'guest'}});
  });
  avatars.avatarList.avatarRemoved.connect(id => {const k=key(id);remote.delete(k);world.handle({type:'left',id:k});});
  entities.entityErased?.connect(ids=>{for(const uuid of ids){const id=key(uuid),record=shared.get(id);if(record){record.group.removeFromParent();record.group.traverse(m=>{if(record.group.userData.ownsGeometry){m.geometry?.dispose();m.material?.map?.dispose();m.material?.dispose?.();}});shared.delete(id);}}status();});
  entities.entityData.connect(data => {
    for(const e of data) {
      diagnostics.receivedEntities++;
      const id=key(e.entityItemID);
      // Render native primitive entities and GLB/glTF models. Other types remain diagnostic-only.
      if(![1,2,4,6].includes(e.entityType))continue;
      let record=shared.get(id);
      if(!record) {
        const group=new THREE.Group();world.scene.add(group);
        record={group,model:null,billboard:e.entityType===6};group.userData.ownsGeometry=e.entityType!==4;shared.set(id,record);
        if(e.entityType===1||e.entityType===2) {
          const geometry=e.entityType===2?new THREE.SphereGeometry(.5,16,12):new THREE.BoxGeometry(1,1,1);
          group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xd6ab65})));
        }
      }
      if(e.name!==undefined)record.name=e.name;
      if(e.entityType===6&&e.imageURL&&!record.imageURL){
        record.imageURL=e.imageURL;
        const texture=new THREE.TextureLoader().load(localAsset(e.imageURL));texture.colorSpace=THREE.SRGBColorSpace;
        record.group.add(new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.45,side:THREE.DoubleSide,roughness:1})));
      }
      if(record.model&&(record.name||'').includes('published full venue')){world.venue.root.visible=false;world.venue.sky.hills.visible=false;world.venue.sky.meadow.visible=false;diagnostics.sharedVenueLoaded=true;}
      if(!record.modelURL && e.entityType===4 && /^https?:\/\//.test(e.modelURL || '') && /\.(glb|gltf|fbx)(?:[?#]|$)/i.test(e.modelURL)) {
          record.modelURL=e.modelURL;instance(localAsset(e.modelURL).replace(/((?:venue-part-\d+|tree-[a-z]+_\d))\.fbx(?=[?#]|$)/,'$1.glb') /* browsers read the GLB twin of native FBX models */).then(model => {if(model&&!closed&&shared.get(id)===record){record.model=model;model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
            const wrapper=new THREE.Group();record.group.add(wrapper);wrapper.add(model);model.position.sub(center);wrapper.scale.set(1/(size.x||1),1/(size.y||1),1/(size.z||1));
            if((record.name||'').includes('published full venue')){world.venue.root.visible=false;world.venue.sky.hills.visible=false;world.venue.sky.meadow.visible=false;diagnostics.sharedVenueLoaded=true;}
}});

      }
      const g=record.group;
      if(e.position)g.position.copy(e.position);
      if(e.rotation)g.quaternion.copy(e.rotation);
      if(e.dimensions)g.scale.copy(e.dimensions);
      if(e.visible!==undefined)g.visible=e.visible;
      const color=e.color;
      if(color&&e.entityType!==4)g.traverse(m=>{if(m.isMesh)m.material.color?.setRGB(color.red/255,color.green/255,color.blue/255,THREE.SRGBColorSpace);});
    }
    status();
  });
  messages.messageReceived.connect((ch,text,sender) => {
    if(ch!==channel || text.length>8192)return;
    let m;try{m=JSON.parse(text);}catch{return;}
    if(m.v!==1)return;
    diagnostics.receivedMessages++;diagnostics.lastMessage={sender:key(sender),message:m};
    if(m.type==='chat' && typeof m.text==='string')onChat?.(key(sender),m.text.slice(0,200));
    // Ceremony control is deliberately not accepted from untrusted MessageMixer senders.
    status();
  });
  interval=setInterval(()=>{
    if(closed || domain.state!==sdk.DomainServer.CONNECTED)return;
    const p=world.rig.position;
    avatars.myAvatar.position={x:p.x,y:p.y+hips(look),z:p.z};
    avatars.myAvatar.orientation=yawQuat(world.controls.yaw);
    camera.position=pos();camera.orientation=quat();camera.fieldOfView=world.camera.fov*Math.PI/180;camera.aspectRatio=world.camera.aspect;camera.farClip=400;
    camera.update();avatars.update();entities.update();
    for(const [id,uuid] of remote) {
      const a=avatars.avatarList.getAvatar(uuid);if(!a)continue;
      const index=lookOf(a.skeletonModelURL);
      const appearance=(index>=0?index:0)+':'+a.sessionDisplayName;
      if(appearances.get(id)!==appearance){appearances.set(id,appearance);world.handle({type:'ident',player:{id,name:a.sessionDisplayName||'Vircadia guest',mode:'body',role:'guest',look:index>=0?index:0}});}
      diagnostics.remoteAvatarModels=[...remote.values()].map(uuid=>avatars.avatarList.getAvatar(uuid).skeletonModelURL);
      const p=a.position,q=a.orientation;
      const yaw=yawOf(q);
      world.handle({type:'s',t:Date.now(),p:[[id,p.x,p.y-hips(index),p.z,yaw,0,0]]});diagnostics.receivedPoses++;
    }
    for(const record of shared.values())if(record.billboard)record.group.rotation.y=Math.atan2(pos().x-record.group.position.x,pos().z-record.group.position.z);
    if(analyser){analyser.getFloatTimeDomainData(audioSamples);let peak=diagnostics.receivedAudioPeak||0;for(const sample of audioSamples)peak=Math.max(peak,Math.abs(sample));diagnostics.receivedAudioPeak=peak;}
    status();
  },50);
  const transport={kind:'vircadia',send(m){if(m.type==='chat')transport.chat(m.text);},
    async setAppearance(index){look=Math.abs(index|0)%AVATARS.length;avatars.myAvatar.skeletonModelURL=appearanceURL(look);diagnostics.selfAvatarModel=avatars.myAvatar.skeletonModelURL;status();},
    chat(text){messages.sendMessage(channel,JSON.stringify({v:1,type:'chat',text:String(text).slice(0,200)}));},
    changeMarker(){messages.sendMessage(channel,JSON.stringify({v:1,type:'set-marker',variant:'sage'}));},
    testDistance(near){world.rig.position.set(near?1:35,0,8);diagnostics.receivedAudioPeak=0;},
    probe(){messages.sendMessage(channel,JSON.stringify({v:1,type:'probe',nonce:crypto.randomUUID(),position:avatars.myAvatar.position}));},
    async listen(){await audio.play();await output.play();
      if(!meterContext){meterContext=new AudioContext();analyser=meterContext.createAnalyser();meterContext.createMediaStreamSource(audio.audioOutput).connect(analyser);}
      await meterContext.resume();
    },
    async testTone(){
      toneContext ||= new AudioContext();await toneContext.resume();
      const oscillator=toneContext.createOscillator(),gain=toneContext.createGain(),destination=toneContext.createMediaStreamDestination();
      gain.gain.value=.12;oscillator.frequency.value=660;oscillator.connect(gain);gain.connect(destination);oscillator.start();
      audio.inputMuted=false;await audio.setAudioInputStream(destination.stream);
      setTimeout(async()=>{await audio.setAudioInputStream(null);audio.inputMuted=true;oscillator.stop();destination.stream.getTracks().forEach(t=>t.stop());},3000);
    },
    async microphone(enabled){
      if(enabled&&!stream){stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});audio.inputMuted=false;await audio.setAudioInputStream(stream);}
      if(!enabled){await audio.setAudioInputStream(null);audio.inputMuted=true;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}}
    },
    close(){if(closed)return;closed=true;clearInterval(interval);clearShared();stream?.getTracks().forEach(t=>t.stop());audio.inputMuted=true;audio.pause();meterContext?.close();toneContext?.close();output.pause();output.srcObject=null;output.remove();messages.unsubscribe(channel);domain.disconnect();for(const {group}of shared.values()){group.removeFromParent();group.traverse(m=>{if(group.userData.ownsGeometry){m.geometry?.dispose();m.material?.dispose?.();}});}shared.clear();world.venue.root.visible=true;world.venue.sky.hills.visible=true;world.venue.sky.meadow.visible=true;},
    diagnostics, domain, avatars, entities, messages, audio};
  world.attach(transport);world.roster=new Map();world.setMode('body',false);
  domain.connect(address);
  return transport;
}
