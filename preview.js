/* 页面入口：每套原型独立保存状态，控件事件都交给共用模拟器。 */
(() => {
  const M=window.MicrowaveSimulator, P=window.microwavePanels;
  const designs={
    keypad:{index:'01',title:'Numeric keypad'},
    dials:{index:'02',title:'Dual rotary dials'},
    touchscreen:{index:'03',title:'Task-based touchscreen'}
  };
  const freshUI=()=>({context:null,draft:'',editor:null,foodPicking:false,foodConfirmed:false,foodIndex:0,unit:'lb',message:'',dialAngle:0});
  const models=Object.fromEntries(Object.keys(designs).map(key=>[key,M.create()]));
  const views=Object.fromEntries(Object.keys(designs).map(key=>[key,freshUI()]));
  const canvas=document.getElementById('model-canvas'),viewport=document.getElementById('model-viewport');
  let currentDesign='keypad',detail=false,activeDrag=null,holdTimer=null,longPressed=false,audioContext=null;
  const model=()=>models[currentDesign], state=()=>model().state, ui=()=>views[currentDesign];
  const secondsFromDigits=draft=>{const d=String(draft).padStart(4,'0');return Number(d.slice(0,2))*60+Number(d.slice(2));};
  const digitsFromSeconds=seconds=>{const minutes=Math.min(99,Math.floor(seconds/60));return String(minutes).padStart(2,'0')+String(seconds-minutes*60).padStart(2,'0');};
  const poundsFromWeight=(value,unit)=>unit==='g'?(value>=45&&value<=2722?Math.min(6,Math.max(.1,value/453.592)):value/453.592):value;
  const invoke=(action,value)=>model().dispatch(action,value);
  function fitModel(){
    const width=detail?470:1120,height=detail?750:800,scale=Math.min(viewport.clientWidth/width,detail?1.18:1);
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    canvas.style.transform='translateX('+(-width*scale/2)+'px) scale('+scale+')';
    viewport.style.height=Math.ceil(height*scale)+'px';
  }
  function beep(completion=false){
    if(!state().sound)return;
    try{
      audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioContext.state==='suspended') audioContext.resume().catch(()=>{});
      for(let i=0;i<(completion?3:1);i++){
        const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+i*.22;
        osc.frequency.value=completion?880:660;gain.gain.setValueAtTime(.035,at);gain.gain.exponentialRampToValueAtTime(.001,at+.12);
        osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.13);
      }
    }catch{/* 浏览器无音频权限时，屏幕反馈仍然有效。 */}
  }
  function render(){
    const active=document.activeElement;
    const focus=active&&canvas.contains(active)?{action:active.dataset.action,value:active.dataset.value,dial:active.dataset.dial}:null;
    canvas.innerHTML=window.createAppliance(P[currentDesign](state(),ui()),currentDesign);
    canvas.querySelector('.appliance-scene').classList.toggle('is-panel-detail',detail);
    paint();
    if(focus){
      const target=[...canvas.querySelectorAll('[data-action],[data-dial]')].find(el=>focus.dial?el.dataset.dial===focus.dial:el.dataset.action===focus.action&&el.dataset.value===focus.value);
      target?.focus({preventScroll:true});
    }
    fitModel();
  }
  function paint(){
    const s=state(),u=ui(),panel=canvas.querySelector('.control-panel');
    if(!panel)return;
    panel.dataset.phase=s.phase;panel.dataset.mode=s.mode;panel.dataset.locked=String(s.locked);panel.dataset.context=u.context||'';
    panel.classList.toggle('has-error',Boolean(s.error||u.editor?.error));
    canvas.querySelector('.appliance').classList.toggle('is-heating',s.phase==='running');
    const text=(selector,value)=>canvas.querySelectorAll(selector).forEach(el=>{if(el.textContent!==String(value))el.textContent=value;});
    text('[data-status]',P.status(s,u,currentDesign==='dials'));text('[data-main-time]',P.display(s,u));
    text('[data-power]',s.power+'%');text('[data-timer-readout]',P.timer(s,u));
    text('[data-minutes]',Math.floor(s.seconds/60));text('[data-seconds]',s.seconds%60);
    text('[data-message]',P.message(s,u,currentDesign==='dials'));text('[data-clock]',s.clockVisible?M.formatClock(s):'');
    const range=canvas.querySelector('.power-slider');
    if(range){range.value=s.power;range.style.setProperty('--range-fill',((s.power-10)/90*100)+'%');}
    const powerDial=canvas.querySelector('[data-dial="power"]');
    if(powerDial){powerDial.style.setProperty('--dial-angle',((s.power-10)/90*270-135)+'deg');powerDial.setAttribute('aria-valuenow',s.power);powerDial.setAttribute('aria-valuetext',s.power+'%');}
    if(activeDrag)canvas.querySelector('[data-dial="'+activeDrag.kind+'"]')?.classList.add('is-dragging');
  }
  function chooseDesign(key){
    currentDesign=key;activeDrag=null;clearTimeout(holdTimer);
    const d=designs[key];
    document.getElementById('design-title').textContent=d.title;
    document.getElementById('model-index').textContent='MODEL '+d.index;
    document.querySelectorAll('[data-design]').forEach(button=>{
      button.classList.toggle('is-selected',button.dataset.design===key);
      button.setAttribute('aria-pressed',String(button.dataset.design===key));
    });
    render();
  }
  function openEditor(kind){
    const s=state(),u=ui();
    const draft=kind==='minutes'?String(Math.floor(s.seconds/60)):kind==='seconds'?String(s.seconds%60):
      kind==='weight'||kind==='defrost'&&s.defrostType==='weight'?P.weightValue(s,u):
      kind==='clock'?M.formatClock(s).replace(':',''):kind==='timer'?'0000':digitsFromSeconds(s.seconds);
    u.editor={kind,draft,fresh:true,error:''};u.context=null;
  }
  function applyEditor(){
    const s=state(),u=ui(),e=u.editor;
    if(!e)return;
    const value=Number(e.draft||0);
    if(!Number.isFinite(value)){e.error='Enter a valid number.';return;}
    if(e.kind==='minutes'||e.kind==='seconds'){
      const max=e.kind==='minutes'?100:59;
      if(!Number.isInteger(value)||value<0||value>max){e.error='Use a whole number from 0 to '+max+'.';return;}
      invoke('setTime',e.kind==='minutes'?value*60+s.seconds%60:Math.floor(s.seconds/60)*60+value);
    }else if(e.kind==='weight'||e.kind==='defrost'&&s.defrostType==='weight'){
      invoke('setWeight',poundsFromWeight(value,u.unit));
    }else if(e.kind==='clock'){
      const d=e.draft.padStart(4,'0'),hours=Number(d.slice(0,2)),minutes=Number(d.slice(2));
      if(hours>23||minutes>59){e.error='Use HH:MM, from 00:00 to 23:59.';return;}
      invoke('setClock',hours*60+minutes);
    }else if(e.kind==='timer'){
      invoke('setTimer',secondsFromDigits(e.draft));
      if(!s.error)invoke('startTimer');
    }else invoke('setTime',secondsFromDigits(e.draft));
    if(s.error)e.error=s.error;else{u.editor=null;beep();}
  }
  function contextDigit(value){
    const u=ui();
    if(u.draft.length>=4){u.message='Four digits maximum. Use Delete to correct.';return;}
    u.draft+=value;
  }
  function finishContext(){
    const u=ui(),s=state();
    if(u.context==='weight'){
      invoke('setWeight',poundsFromWeight(u.unit==='g'?Number(u.draft||0):Number(u.draft||0)/10,u.unit));
    }else if(u.context==='timer'){
      invoke('setTimer',secondsFromDigits(u.draft));
      if(!s.error)invoke('startTimer');
    }else{
      const d=u.draft.padStart(4,'0'),hours=Number(d.slice(0,2)),minutes=Number(d.slice(2));
      if(hours>23||minutes>59){u.message='Use a 24-hour time: HH:MM.';return;}
      invoke('setClock',hours*60+minutes);
    }
    if(!s.error){u.context=null;u.draft='';beep();}
  }
  function changePortion(direction){
    const f=M.foods.find(f=>f.id===state().foodId);
    if(!f){invoke('setPortions',1);return;}
    const i=f.portions.indexOf(state().portions),next=Math.max(0,Math.min(f.portions.length-1,i+direction));
    invoke('setPortions',f.portions[next]);
  }
  function changeWeight(direction){
    const s=state(),u=ui(),delta=u.unit==='g'?50/453.592:.1;
    invoke('setWeight',Math.min(6,Math.max(.1,Math.round((s.weightLb+direction*delta)*100000)/100000)));
  }
  function act(action,value){
    const s=state(),u=ui();u.message='';
    if(s.locked&&!['lock','back'].includes(action)){
      invoke('completeInput');render();return;
    }
    switch(action){
      case 'start':
        if(u.foodPicking){u.message='Press the dial to select a food.';break;}
        if(s.phase==='running'||s.phase==='paused'){invoke('toggleStart');if(!s.error)beep();break;}
        if(u.context==='weight'){finishContext();if(s.error)break;}
        if((u.context||u.editor)&&s.phase!=='running'){u.message=u.context==='timer'?'Press Timer to start the kitchen timer.':u.context==='clock'?'Press Set Clock to save, or Cancel to exit.':'Apply this setting or press Back.';break;}
        invoke('toggleStart');if(!s.error)beep();break;
      case 'cancel':
        if(longPressed){longPressed=false;return;}
        if(u.editor||u.context==='timer'||u.context==='clock'){u.editor=null;u.context=null;u.draft='';invoke('completeInput');break;}
        invoke('cancel');Object.assign(u,freshUI(),{unit:u.unit});break;
      case 'quick':invoke('quick30');if(!s.error){u.context=null;u.editor=null;u.foodPicking=false;beep();}break;
      case 'digit':
        if(u.context)contextDigit(value);
        else{if(s.mode==='food'||s.mode==='defrost'&&s.defrostType==='weight')invoke('setMode','cook');invoke('digit',value);}break;
      case 'delete':if(u.context)u.draft=u.draft.slice(0,-1);else invoke('delete');break;
      case 'clear':if(u.context)u.draft='';else invoke('clear');break;
      case 'power':invoke('setPower',Math.max(10,Math.min(100,s.power+Number(value))));break;
      case 'time':invoke('adjustTime',Number(value));break;
      case 'mode':
        if(currentDesign!=='touchscreen'&&value==='defrost'&&s.mode==='defrost'){
          if(s.phase!=='running'&&s.defrostType==='weight'&&u.unit==='lb'){act('unit','g');return;}
          invoke('setDefrostType',s.defrostType==='weight'?'time':'weight');
          if(!s.error&&s.defrostType==='weight')u.unit='lb';
        }
        else invoke('setMode',value);
        if(!s.error){
          u.context=null;u.editor=null;u.foodPicking=currentDesign==='dials'&&value==='food';u.foodConfirmed=false;
          u.foodIndex=Math.max(0,M.foods.findIndex(f=>f.id===s.foodId));
          if(currentDesign==='keypad'&&value==='defrost'&&s.defrostType==='weight'){u.context='weight';u.draft='';}
        }break;
      case 'food':invoke('selectFood',value);if(!s.error){u.context=null;u.foodPicking=false;}break;
      case 'portion':changePortion(Number(value));break;
      case 'weight':changeWeight(Number(value));break;
      case 'defrostType':
        if(s.mode==='defrost'&&s.defrostType===value)break;
        invoke('setDefrostType',value);
        if(!s.error&&currentDesign==='keypad'){u.context=value==='weight'?'weight':null;u.draft='';}
        if(u.editor){u.editor.draft=value==='weight'?P.weightValue(s,u):'0000';u.editor.fresh=true;}break;
      case 'unit':{
        const old=u.unit;u.unit=value;
        if(u.context==='weight'){
          const amount=Number(u.draft||0),lb=old==='g'?amount/453.592:amount/10;
          u.draft=value==='g'?String(Math.round(lb*453.592)):String(Math.round(lb*10));
        }
        if(u.editor&&(u.editor.kind==='weight'||u.editor.kind==='defrost'&&s.defrostType==='weight')){
          const amount=Number(u.editor.draft||0),lb=old==='g'?amount/453.592:amount;
          u.editor.draft=value==='g'?String(Math.round(lb*453.592)):String(Number(lb.toFixed(2)));
          u.editor.fresh=true;
        }break;
      }
      case 'edit':openEditor(value);break;
      case 'timer':
        if(u.context==='timer')finishContext();
        else if(s.timerPhase==='running'||s.timerPhase==='done')invoke('stopTimer');
        else if(currentDesign==='touchscreen')openEditor('timer');
        else{u.context='timer';u.draft='';u.foodPicking=false;u.editor=null;}break;
      case 'clock':
        if(s.phase==='running'||s.phase==='paused'){u.message='Cancel cooking before setting the clock.';break;}
        if(u.context==='clock')finishContext();
        else if(currentDesign==='touchscreen')openEditor('clock');
        else{u.context='clock';u.draft='';u.foodPicking=false;u.editor=null;}break;
      case 'clockDisplay':invoke('toggleClock');break;
      case 'sound':invoke('setSound',!s.sound);u.message=s.sound?'Sound on.':'Sound off.';if(s.sound)beep();break;
      case 'lock':invoke(s.locked?'unlock':'lock');break;
      case 'back':u.context=null;u.editor=null;u.foodPicking=false;u.message='';break;
      case 'editorDigit':{
        const e=u.editor;if(!e)break;
        if(e.fresh){e.draft='';e.fresh=false;}
        const decimal=e.kind==='weight'||e.kind==='defrost'&&s.defrostType==='weight';
        if(value==='.'&&!decimal||value==='.'&&e.draft.includes('.'))break;
        if(e.draft.length<(decimal?6:4))e.draft+=value;
        else e.error='Use Delete to change this value.';break;
      }
      case 'editorClear':u.editor.draft='';u.editor.fresh=false;u.editor.error='';break;
      case 'editorDelete':u.editor.draft=u.editor.draft.slice(0,-1);u.editor.fresh=false;u.editor.error='';break;
      case 'apply':applyEditor();break;
    }
    render();
  }
  function turnDial(kind,steps,fromDrag=false){
    const s=state(),u=ui();u.message='';
    if(s.locked){invoke('completeInput');paint();return;}
    if(kind==='time'&&!fromDrag)u.dialAngle+=steps*15;
    if(kind==='power')invoke('setPower',Math.max(10,Math.min(100,s.power+steps*10)));
    else if(u.context){
      if(u.context==='timer')u.draft=digitsFromSeconds(Math.max(0,Math.min(6039,secondsFromDigits(u.draft)+steps*5)));
      else{
        const d=u.draft.padStart(4,'0'),minutes=(Number(d.slice(0,2))*60+Number(d.slice(2))+steps+1440)%1440;
        u.draft=String(Math.floor(minutes/60)).padStart(2,'0')+String(minutes%60).padStart(2,'0');
      }
    }else if(u.foodPicking)u.foodIndex=Math.max(0,Math.min(M.foods.length-1,u.foodIndex+steps));
    else if(s.mode==='food'){changePortion(steps);if(!s.error)u.foodConfirmed=false;}
    else if(s.mode==='defrost'&&s.defrostType==='weight')changeWeight(steps);
    else invoke('adjustTime',steps*5);
    render();
  }
  function pressDial(){
    const s=state(),u=ui();
    u.message='';
    if(s.locked){invoke('completeInput');render();return;}
    if(u.context)finishContext();
    else if(u.foodPicking){
      const food=M.foods[u.foodIndex];
      if(s.foodId!==food.id)invoke('selectFood',food.id);else invoke('completeInput');
      if(!s.error){u.foodPicking=false;u.foodConfirmed=false;}
    }
    else if(s.mode==='food'){invoke('completeInput');u.foodConfirmed=true;}
    else{invoke('completeInput');if(s.phase==='idle')u.message='Time selected. Press Start/Pause.';}
    render();
  }
  document.querySelectorAll('[data-design]').forEach(button=>button.addEventListener('click',()=>chooseDesign(button.dataset.design)));
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    detail=button.dataset.view==='detail';canvas.querySelector('.appliance-scene').classList.toggle('is-panel-detail',detail);
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));fitModel();
  }));
  document.getElementById('reset-model').addEventListener('click',()=>{invoke('reset');views[currentDesign]=freshUI();render();});
  canvas.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(button)act(button.dataset.action,button.dataset.value);
  });
  canvas.addEventListener('input',event=>{
    if(event.target.matches('.power-slider')){ui().message='';invoke('setPower',Number(event.target.value));paint();}
  });
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    const button=event.target.closest('[data-action="cancel"]');
    if(button){
      longPressed=false;clearTimeout(holdTimer);
      holdTimer=setTimeout(()=>{longPressed=true;invoke(state().locked?'unlock':'lock');render();},3000);
    }
    const dial=event.target.closest('[data-dial]');
    if(!dial)return;
    const box=dial.getBoundingClientRect(),cx=box.x+box.width/2,cy=box.y+box.height/2;
    const distance=Math.hypot(event.clientX-cx,event.clientY-cy);
    activeDrag={kind:dial.dataset.dial,cx,cy,innerRadius:box.width*.18,
      angle:distance>box.width*.18?Math.atan2(event.clientY-cy,event.clientX-cx)*180/Math.PI:null,
      rotation:0,steps:0,moved:false,pointer:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
    dial.focus({preventScroll:true});dial.classList.add('is-dragging');event.preventDefault();
  });
  document.addEventListener('pointermove',event=>{
    if(!activeDrag||event.pointerId!==activeDrag.pointer)return;
    const drag=activeDrag;
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>4)drag.moved=true;
    // 绕中心计算角度；跨过整圈时继续累计，避免指针突然跳回。
    if(Math.hypot(event.clientX-drag.cx,event.clientY-drag.cy)<drag.innerRadius){drag.angle=null;return;}
    const angle=Math.atan2(event.clientY-drag.cy,event.clientX-drag.cx)*180/Math.PI;
    if(drag.angle===null){drag.angle=angle;return;}
    const change=(angle-drag.angle+540)%360-180;
    drag.angle=angle;drag.rotation+=change;
    if(state().locked)return;
    if(drag.kind==='time')ui().dialAngle+=change;
    const stepAngle=drag.kind==='power'?30:15;
    const steps=Math.round(drag.rotation/stepAngle),delta=steps-drag.steps;
    if(delta){drag.steps=steps;turnDial(drag.kind,delta,true);}
    else if(drag.kind==='time')canvas.querySelector('[data-dial="time"]').style.setProperty('--dial-angle',ui().dialAngle+'deg');
  });
  const endPointer=event=>{
    clearTimeout(holdTimer);
    if(!activeDrag||event.pointerId!==activeDrag.pointer)return;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    const click=!activeDrag.moved&&activeDrag.kind==='time';activeDrag=null;
    canvas.querySelectorAll('.is-dragging').forEach(el=>el.classList.remove('is-dragging'));
    if(click&&event.type==='pointerup')pressDial();
  };
  document.addEventListener('pointerup',endPointer);document.addEventListener('pointercancel',endPointer);
  canvas.addEventListener('wheel',event=>{
    const dial=event.target.closest('[data-dial]');if(!dial)return;
    event.preventDefault();turnDial(dial.dataset.dial,event.deltaY<0?1:-1);
  },{passive:false});
  canvas.addEventListener('keydown',event=>{
    const dial=event.target.closest('[data-dial]');
    if(dial){
      if(['ArrowRight','ArrowUp','ArrowLeft','ArrowDown'].includes(event.key)){
        event.preventDefault();turnDial(dial.dataset.dial,['ArrowRight','ArrowUp'].includes(event.key)?1:-1);
      }else if(['Enter',' '].includes(event.key)){event.preventDefault();if(dial.dataset.dial==='time')pressDial();}
      return;
    }
    if(event.key==='Escape'){event.preventDefault();act('back');return;}
    if(event.key.match(/^\d$/)&&ui().editor){event.preventDefault();act('editorDigit',event.key);return;}
    if(event.key==='Backspace'&&ui().editor){event.preventDefault();act('editorDelete');return;}
    if(event.key==='Enter'&&ui().editor&&event.target.dataset.action!=='back'){event.preventDefault();act('apply');}
    if(event.target.dataset.action==='cancel'&&[' ','Enter'].includes(event.key)&&!event.repeat){
      longPressed=false;holdTimer=setTimeout(()=>{longPressed=true;invoke(state().locked?'unlock':'lock');render();},3000);
    }
  });
  canvas.addEventListener('keyup',()=>clearTimeout(holdTimer));
  window.addEventListener('blur',()=>{clearTimeout(holdTimer);activeDrag=null;});
  let lastSecond=-1;
  setInterval(()=>{
    let complete=false;
    for(const [name,sim] of Object.entries(models)){
      const heating=sim.state.phase,timing=sim.state.timerPhase;sim.tick();
      if(name===currentDesign&&(heating==='running'&&sim.state.phase==='done'||timing==='running'&&sim.state.timerPhase==='done'))complete=true;
    }
    const second=Math.floor(Date.now()/1000);
    if(second!==lastSecond||complete){lastSecond=second;paint();}
    if(complete)beep(true);
  },100);
  new ResizeObserver(fitModel).observe(viewport);
  chooseDesign(currentDesign);
})();
