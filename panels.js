/* 三套面板共用运行状态，保留不同的输入方式。 */
(() => {
  const M = window.MicrowaveSimulator;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const key = (label, action, value = '', style = '', aria = '') =>
    '<button type="button" class="panel-key ' + style + '" data-action="' + action + '" data-value="' + escape(value) + '"' +
    (aria ? ' aria-label="' + escape(aria) + '"' : '') + '>' + label + '</button>';
  const foodFor = s => M.foods.find(f => f.id === s.foodId);
  const portion = s => {
    const f = foodFor(s);
    return f ? f.portionLabels[f.portions.indexOf(s.portions)] : 'Choose a food';
  };
  const enteredTime = digits => { const d=String(digits||'').padStart(4,'0'); return M.formatTime(Number(d.slice(0,2))*60+Number(d.slice(2))); };
  const activeCycle = s => s.phase==='running'||s.phase==='paused';
  const timer = (s,u={}) => u.context==='timer' ? enteredTime(u.draft) : s.timerPhase === 'done' ? 'END' : s.timerPhase === 'running' || s.timerSeconds ? M.formatTime(s.timerSeconds) : 'OFF';
  const status = (s, u, isDial=false) => {
    if (s.locked) return 'LOCKED';
    if (u.context&&!activeCycle(s)) return u.context === 'timer' ? 'KITCHEN TIMER · NO HEAT' : u.context === 'weight' ? 'DEFROST · ENTER '+u.unit.toUpperCase() : 'SET CLOCK · 24 HOUR';
    if(isDial&&s.mode==='food'&&!u.context){
      if(u.foodPicking)return 'SELECT FOOD';
      if(s.phase==='idle')return u.foodConfirmed?'READY TO START':'SET PORTION';
    }
    const mode = s.mode === 'defrost' ? 'DEFROST ('+(s.defrostType==='time'?'TIME':u.unit.toUpperCase())+')' : s.mode === 'food' ? 'FOOD PRESET' : 'COOK';
    return mode + ' · ' + ({idle:'READY',running:'RUNNING',paused:'PAUSED',done:'END'}[s.phase]);
  };
  const display = (s,u) => activeCycle(s) ? M.formatTime(s.seconds) :
    u.context === 'weight' ? (u.unit==='lb'?(Number(u.draft||0)/10).toFixed(1):String(Number(u.draft||0))) + ' ' + u.unit : u.context==='clock' ? M.formatDigits(u.draft) : u.context==='timer' ? enteredTime(u.draft) :
    u.foodPicking ? M.foods[u.foodIndex].name :
    s.phase === 'done' ? 'END' : M.formatTime(s.seconds);
  const message = (s,u,isDial=false) => {
    if (u.message || s.error) return u.message || s.error;
    if (s.locked) return 'Hold Cancel/Off for 3 sec to unlock.';
    if (u.context === 'timer') return 'Timer ' + enteredTime(u.draft) + ' · Timer to start / Cancel to exit';
    if (u.context === 'clock') return 'Enter HH:MM · press Set Clock to save';
    if (u.context === 'weight') return u.unit==='lb' ? 'Enter tenths of a lb: 15 = 1.5 lb · press Start' : 'Enter grams, then press Start';
    if (u.foodPicking) return 'Turn to choose · press the dial to select';
    if (s.phase === 'done') return 'Heating complete.';
    if (s.timerPhase === 'done') return 'Kitchen timer finished.';
    if (s.mode === 'food'&&!isDial) return foodFor(s) ? foodFor(s).name + ' · ' + portion(s) : 'Choose a food, then set the portion.';
    if (s.mode === 'food'&&isDial&&s.phase==='idle')return u.foodConfirmed?'Press Start/Pause.':'Turn to set portion · press dial to confirm';
    if (s.mode === 'defrost' && s.defrostType === 'weight') return 'Weight ' + weightValue(s,u) + ' ' + u.unit + ' · power ' + s.power + '%';
    return s.phase === 'running' ? 'Heating · press Start/Pause to pause' :
      s.phase === 'paused' ? 'Paused · press Start/Pause to resume' :
      s.phase === 'done' ? 'Heating complete.' : isDial?'Turn the large dial · 5 sec per step':'Set time, then press Start/Pause.';
  };
  const weightValue = (s,u) => u.unit === 'g' ? String(Math.round(s.weightLb * 453.592)) : Number(s.weightLb.toFixed(2)).toString();
  const readout = (s,u,isDial=false) => '<div class="readout"><div class="readout-top"><span class="readout-status" data-status>' + status(s,u,isDial) +
    '</span><span class="readout-wall-clock" data-clock>'+(s.clockVisible?M.formatClock(s):'')+'</span></div><div class="readout-data"><div class="readout-clock"><strong class="readout-time' + (u.foodPicking ? ' is-text' : '') +
    '" data-main-time>' + display(s,u) + '</strong><div class="time-units">' + (u.foodPicking ? '<span>FOOD '+(u.foodIndex+1)+' OF '+M.foods.length+'</span>' : '<span>' + (u.context === 'clock' ? 'HOUR' : 'MIN') +
    '</span><span>' + (u.context === 'clock' ? 'MIN' : 'SEC') +
    '</span>') + '</div></div><div class="readout-power"><strong data-power>' + s.power + '%</strong><span>POWER</span></div></div><p data-message>' +
    escape(message(s,u,isDial)) + '</p></div>';
  const dialReadout = (s,u) => {
    if(s.mode!=='food'||u.context)return readout(s,u,true);
    const header='<div class="readout-top"><span class="readout-status" data-status>'+status(s,u,true)+'</span><span class="readout-wall-clock" data-clock>'+(s.clockVisible?M.formatClock(s):'')+'</span></div>';
    const food=foodFor(s);
    const content=u.foodPicking?
      '<ul class="dial-food-list" role="listbox" aria-label="Food presets" aria-activedescendant="dial-food-'+u.foodIndex+'">'+M.foods.map((f,i)=>
        '<li id="dial-food-'+i+'" role="option" aria-selected="'+(i===u.foodIndex)+'" class="'+(i===u.foodIndex?'is-current':'')+'"><span>'+(i+1)+'</span>'+escape(f.name)+'</li>').join('')+'</ul>':
      '<div class="dial-food-selection"><strong class="dial-food-name">'+escape(food?food.name:'Choose a food')+'</strong><strong class="dial-food-portion">'+escape(portion(s))+'</strong></div>'+
      '<div class="dial-food-settings"><div><span>TIME · MIN:SEC</span><strong data-main-time>'+display(s,u)+'</strong></div><div><span>POWER</span><strong data-power>'+s.power+'%</strong></div></div>';
    return '<div class="readout dial-food-screen">'+header+content+'<p data-message>'+escape(message(s,u,true))+'</p></div>';
  };
  const transport = () => '<div class="transport">' + key('<span class="play-symbol" aria-hidden="true">▶</span> <span data-start-label>Start/Pause</span>', 'start', '', 'key-start','Start/Pause') +
    key('Cancel/Off','cancel','','key-cancel') + '</div>';
  const quick = () => key('Start / +30 Sec','quick','','key-quick');
  const lock = () => '<div class="lock-note">Control Lock: hold Cancel/Off for 3 sec</div>';
  const utility = (s,withDefrost=true) => '<div class="utilities ' + (withDefrost ? 'utilities-four' : '') + '">' +
    (withDefrost ? key('Defrost<br>lb / g / time','mode','defrost','','Defrost') : '') + key('Set Clock','clock') +
    key('Sound','sound') + key('Clock<br>Display','clockDisplay','','','Clock Display') + '</div>';
  const numbers = (editor=false) => '<div class="' + (editor ? 'editor-grid' : 'number-grid') + '">' +
    [1,2,3,4,5,6,7,8,9].map(n => key(n,editor?'editorDigit':'digit',n,'number-key',String(n))).join('') +
    key('Clear',editor?'editorClear':'clear','','edit-key') + key('0',editor?'editorDigit':'digit',0,'number-key','0') +
    key('Delete',editor?'editorDelete':'delete','','edit-key') + '</div>';
  const units = u => '<div class="weight-units">' + ['lb','g'].map(unit=>key(unit,'unit',unit,u.unit===unit?'is-active':'')).join('') + '</div>';
  const defrostTypes = type => '<div class="defrost-types">' + key('By weight','defrostType','weight',type==='weight'?'is-active':'') +
    key('By time','defrostType','time',type==='time'?'is-active':'') + '</div>';
  const portionControls = s => '<div class="portion-controls">' + key('−','portion',-1,'','Decrease portion') +
    '<strong>' + portion(s) + '</strong>' + key('+','portion',1,'','Increase portion') + '</div>';
  const editor = (s,u) => {
    if (!u.editor) return '';
    const e=u.editor;
    const titles={minutes:'Set minutes',seconds:'Set seconds',timer:'Kitchen timer',clock:'Set clock',weight:'Set weight',defrost:'Defrost'};
    const isTime=['timer','clock'].includes(e.kind) || e.kind==='defrost' && s.defrostType==='time';
    const value=isTime ? (e.kind==='clock'?M.formatDigits(e.draft):enteredTime(e.draft)) : (e.draft || '0');
    return '<section class="panel-editor" role="dialog" aria-modal="true" aria-label="' + titles[e.kind] + '"><h3 class="editor-title">' + titles[e.kind] + '</h3>' +
      (e.kind==='defrost'?defrostTypes(s.defrostType):'') +
      '<output class="editor-value">' + value + '</output><p class="editor-hint">' +
      (e.kind==='clock'?'HH:MM · 24-hour clock':e.kind==='timer'?'MIN:SEC · does not heat':e.kind==='defrost'?(s.defrostType==='time'?'MIN:SEC':u.unit):e.kind==='weight'?u.unit:e.kind) +
      '</p>' + numbers(true) +
      ((e.kind==='weight'||e.kind==='defrost'&&s.defrostType==='weight') ? '<div class="editor-extra">' + key('.','editorDigit','.','','Decimal point') + units(u) + '</div>' : '') +
      (e.kind==='clock'?key(s.clockVisible?'Clock display: On':'Clock display: Off','clockDisplay'):'') +
      '<p class="editor-error" role="status">' + escape(e.error || '') + '</p><div class="editor-actions">' + key('Back','back') +
      key(e.kind==='timer'?'Start timer':'Apply','apply','','key-start') + '</div></section>';
  };
  const keypad = (s,u) => readout(s,u) +
    '<div class="manual-zones"><section class="keypad-zone"><h3>MIN:SEC · 230 = 2:30</h3>' +
    numbers() + '</section><div class="side-zones"><section class="power-zone"><h3>Power level</h3><strong data-power>' + s.power +
    '%</strong><div>' + key('−','power',-10,'small-key','Decrease power') + key('+','power',10,'small-key','Increase power') +
    '</div></section><section class="timer-zone"><h3>Kitchen timer</h3><span class="timer-off" data-timer-readout>' + timer(s,u) + '</span>' +
    key('Timer On/Off','timer','','timer-key') + '</section></div></div>' + transport() + quick() +
    '<section class="preset-zone"><h3>Food presets</h3><div class="preset-grid">' +
    M.foods.map(f=>key(f.name,'food',f.id,s.foodId===f.id?'is-active':'')).join('') +
    key('Portion −','portion',-1) + key('Portion +','portion',1) + '</div></section>' + utility(s) + lock();
  const dial = (s,u,small=false) => {
    const value=small?s.power:u.context?Number(u.draft)||0:u.foodPicking?u.foodIndex:s.mode==='food'?s.portions:s.mode==='defrost'&&s.defrostType==='weight'?s.weightLb:s.seconds;
    const angle=small?((s.power-10)/90*270-135):(u.dialAngle||0);
    const max=small?100:u.foodPicking?6:s.mode==='food'?4:s.mode==='defrost'&&s.defrostType==='weight'?6:6039;
    return '<div class="dial-wrap ' + (small?'dial-wrap-small':'') + '">' + (small?'<div class="dial-ticks" aria-hidden="true">'+Array.from({length:10},(_,i)=>'<i style="--tick-angle:'+(-135+i*30)+'deg"></i>').join('')+'</div>':'') + '<div class="dial-body" data-dial="' +
      (small?'power':'time') + '" role="slider" tabindex="0" aria-label="' + (small?'Power dial':'Time / Portion dial') +
      '" aria-valuemin="' + (small?10:0) + '" aria-valuemax="' + max + '" aria-valuenow="' + value + '" aria-valuetext="' + escape(small?s.power+'%':display(s,u)) +
      '" style="--dial-angle:' + angle + 'deg"><div class="dial-rim"></div><div class="dial-surface"><div class="dial-indicator"><i class="dial-pointer"></i></div></div><div class="dial-lettering">' +
      (small?'<strong data-power>'+s.power+'%</strong>':'<strong>TURN</strong><span>Press to select</span>') + '</div></div><div class="dial-extents"><span>' +
      (small?'10%':'↶ LESS') + '</span><span>' + (small?'100%':'MORE ↷') + '</span></div></div>';
  };
  const dials = (s,u) => dialReadout(s,u) + '<div class="mode-keys">' +
    [['Cook Time','cook'],['Food Menu','food'],['Defrost','defrost']].map(([label,mode])=>key(mode==='defrost'?'Defrost<br>lb / g / time':label,'mode',mode,s.mode===mode?'key-selected':'',label)).join('') +
    '</div><section class="dial-zones"><div class="time-dial-zone"><h3>Time / Menu / Weight' +
    '</h3>' + dial(s,u) + '</div><div class="power-dial-zone"><h3>Power level</h3>' + dial(s,u,true) +
    '</div></section>' + transport() + quick() +
    '<section class="dial-timer"><h3>Kitchen timer</h3><div>' + key('Timer On/Off','timer') +
    '<span class="timer-pill">TIMER <strong data-timer-readout>' + timer(s,u) + '</strong></span></div></section>' + utility(s,false) + lock();
  const timeFields = (s) => '<section class="touch-time"><h3>' + (s.mode==='defrost'?'Defrost time':'Heating time') + '</h3><div class="time-fields">' +
    key('<strong data-minutes>'+Math.floor(s.seconds/60)+'</strong><span>MINUTES</span>','edit','minutes','time-field','Edit minutes') +
    key('<strong data-seconds>'+(s.seconds%60)+'</strong><span>SECONDS</span>','edit','seconds','time-field','Edit seconds') +
    '</div><div class="time-adjustments"><div class="time-stepper">' + key('−','time',-60,'','Decrease minutes') + key('+','time',60,'','Increase minutes') +
    '</div><div class="time-stepper">'+key('−','time',-1,'','Decrease seconds')+key('+','time',1,'','Increase seconds')+'</div></div></section>';
  const powerSlider = s => '<section class="touch-power"><div><h3>Power level</h3><output data-power>' + s.power +
    '%</output></div><input type="range" class="power-slider" min="10" max="100" step="10" value="'+s.power+
    '" style="--range-fill:'+((s.power-10)/90*100)+'%" aria-label="Power level"><div class="slider-ticks"><span>10%</span><span>100%</span></div></section>';
  const touchscreen = (s,u) => {
    let content=timeFields(s)+powerSlider(s);
    if(s.mode==='food') content='<section class="touch-food-grid">'+M.foods.map(f=>key(f.name,'food',f.id,s.foodId===f.id?'is-active':'')).join('')+
      '</section>'+portionControls(s)+'<p class="program-summary">Program <strong data-main-time>'+M.formatTime(s.seconds)+'</strong> · <span data-power>'+s.power+'%</span> power</p>';
    if(s.mode==='defrost') content=defrostTypes(s.defrostType)+(s.defrostType==='weight'?
      '<section><h3>Food weight</h3><div class="weight-controls">'+key('−','weight',-1,'','Decrease weight')+
      key('<strong>'+weightValue(s,u)+'</strong> '+u.unit,'edit','weight','weight-value','Edit weight')+key('+','weight',1,'','Increase weight')+
      '</div>'+units(u)+'</section><p class="program-summary">Program <strong data-main-time>'+M.formatTime(s.seconds)+'</strong> · <span data-power>'+s.power+'%</span> power</p>':
      timeFields(s)+powerSlider(s));
    return '<section class="touch-display"><div class="touch-screen-content"'+(u.editor?' inert aria-hidden="true"':'')+'><div class="touch-status"><span data-status>'+status(s,u)+'</span><span data-clock>'+ (s.clockVisible?M.formatClock(s):'')+
      '</span></div><div class="touch-tabs">'+[['Cook Time','cook'],['Food Presets','food'],['Defrost','defrost']].map(([name,mode])=>
      key(name,'mode',mode,'touch-tab '+(s.mode===mode?'is-active':''))).join('')+
      '</div><div class="touch-mode-content">'+content+'</div><p class="panel-message" data-message role="status">'+escape(message(s,u))+'</p>'+
      quick()+'<section class="touch-timer"><div><h3>Kitchen timer</h3><strong data-timer-readout>'+timer(s)+'</strong></div>'+
      key(s.timerPhase==='running'?'Stop Timer':'Set Timer','timer')+'</section><div class="touch-settings">'+key('Clock','clock')+
      key(s.sound?'Sound On':'Sound Off','sound')+key(s.locked?'Unlock':'Control Lock','lock')+'</div></div>'+editor(s,u)+'</section>'+transport()+
      '<div class="touch-signature">GE <span>MICROWAVE</span></div>';
  };
  window.microwavePanels = {keypad,dials,touchscreen,status,display,message,timer,weightValue,escape};
})();
