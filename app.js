(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const preferenceKey = 'unprompted-zh:settings:v1';
  const defaults = {speech:1,research:10,sound:true,category:'general',researchCategory:'research-tech',mode:'quick'};
  let storageAvailable = true;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}') || {}; } catch { storageAvailable = false; }
  const clampMinutes = (value,max,fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(1,Math.min(max,Math.round(value))) : fallback;
  const settings = {...defaults,speech:clampMinutes(saved.speech,10,1),research:clampMinutes(saved.research,60,10),sound:typeof saved.sound==='boolean'?saved.sound:true,category:TOPIC_CATEGORIES.some(c=>c.id===saved.category)?saved.category:'general',researchCategory:RESEARCH_CATEGORIES.some(c=>c.id===saved.researchCategory)?saved.researchCategory:'research-tech',mode:saved.mode==='research'?'research':'quick'};
  const state = {mode:settings.mode,topic:'',selected:false,spinning:false,phase:'idle',paused:false,remaining:0,total:0,deadline:0,preparationMinutes:10,speechMinutes:1,interval:null,drawTimeout:null,bag:[],bagKey:''};
  const sounds={draw:$('draw-audio'),land:$('land-audio'),done:$('done-audio')};
  Object.values(sounds).forEach(audio=>{audio.volume=.85;audio.load()});
  function persist() {
    try { localStorage.setItem(preferenceKey,JSON.stringify(settings)); }
    catch { storageAvailable = false; }
    $('storage-note').textContent = storageAvailable ? '设置会自动保存在当前浏览器。' : '当前浏览器无法保存设置；本次练习仍可正常使用。';
  }
  async function playSound(kind='land') {
    if(!settings.sound)return false;
    try {
      const audio=sounds[kind]||sounds.land;
      audio.pause();audio.currentTime=0;
      await audio.play();
      return true;
    } catch {
      $('sound-status').textContent='浏览器暂未允许播放声音，请点击“试听提示音”重试。';
      return false;
    }
  }
  function categories() {return state.mode==='research'?RESEARCH_CATEGORIES:TOPIC_CATEGORIES;}
  function categorySetting() {return state.mode==='research'?'researchCategory':'category';}
  function selectedCategory() {return categories().find(category=>category.id===settings[categorySetting()])||categories()[0];}
  function populateCategories() {
    const select=$('category');select.replaceChildren();
    for(const category of categories()){
      const option=document.createElement('option');option.value=category.id;option.textContent=category.name;select.append(option);
    }
    select.value=selectedCategory().id;
    $('category-icon').textContent=selectedCategory().icon;
    document.querySelector('label[for="category"]').textContent=state.mode==='research'?'深度研究分类':'即兴表达分类';
  }
  function pool() { return selectedCategory().topics; }
  function shuffle(items) {
    const result=[...items];
    for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}
    return result;
  }
  function nextTopic() {
    const key=state.mode+':'+selectedCategory().id;
    if(!state.bag.length||state.bagKey!==key){state.bag=shuffle(pool());state.bagKey=key;
      if(state.bag.length>1&&state.bag[state.bag.length-1]===state.topic){[state.bag[0],state.bag[state.bag.length-1]]=[state.bag[state.bag.length-1],state.bag[0]];}
    }
    return state.bag.pop();
  }
  function setTopic(topic) {state.topic=topic;$('topic').textContent=topic;$('topic').classList.toggle('long',state.mode!=='research'&&topic.length>13);}
  function status(text) {
    $('topic-status').replaceChildren();const dot=document.createElement('span');dot.className='status-dot';$('topic-status').append(dot,document.createTextNode(text));
  }
  function updateButtons() {
    $('spin').disabled=state.spinning;
    $('start').disabled=state.spinning||!state.selected;
    $('start').hidden=state.phase!=='idle';
    $('settings-open').disabled=state.spinning;
    $('category').disabled=state.spinning;
    document.querySelectorAll('.mode-option').forEach(button=>button.disabled=state.spinning);
    $('spin').querySelector('span').textContent=state.spinning?'灵感转动中…':state.selected?'再抽一个':'抽一个话题';
    $('start').querySelector('span').textContent=state.selected?`重新开始 ${settings.research} 分钟准备`:'抽题后点击开始准备';
    $('enter-hint').textContent=state.phase==='research'?'结束准备':state.phase==='ready'?'开始表达':state.phase==='speech'?'暂停 / 继续':state.phase==='done'?'再表达一次':'开始准备';
  }
  function updateMode() {
    resetTimer();
    document.body.dataset.mode=state.mode;
    document.querySelectorAll('.mode-option').forEach(button=>{
      const active=button.dataset.mode===state.mode;
      button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
    });
    $('practice-panel').setAttribute('aria-labelledby','mode-'+state.mode);
    $('mode-description').textContent=state.mode==='research'?'带着好奇去探索，再把理解说给世界听。':'不必字斟句酌，练习把想法说出口。';
    $('category-wrap').hidden=false;$('research-note').hidden=true;populateCategories();
    state.selected=false;status('灵感就绪');setTopic(pool()[0]);
    $('topic-hint').textContent=state.mode==='research'?'查阅资料，梳理观点，再用自己的话讲出来。':'一个话题，一点好奇心，一次新的表达。';
    $('topic-area').classList.remove('landed');updateButtons();
  }
  function switchMode(mode) { if(state.spinning||state.mode===mode)return;state.mode=mode;settings.mode=mode;persist();updateMode(); }
  document.querySelectorAll('.mode-option').forEach(button=>{
    button.addEventListener('click',()=>switchMode(button.dataset.mode));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||state.spinning)return;
      event.preventDefault();const mode=event.key==='Home'?'quick':event.key==='End'?'research':state.mode==='quick'?'research':'quick';switchMode(mode);$('mode-'+mode).focus();
    });
  });
  $('category').addEventListener('change',()=>{settings[categorySetting()]=$('category').value;persist();updateMode()});
  function spin() {
    if(state.spinning||$('settings-dialog').open)return;
    resetTimer();
    state.spinning=true;state.selected=false;updateButtons();status('正在寻找灵感');$('topic-area').classList.remove('landed');$('topic-area').classList.add('spinning');$('topic-hint').textContent='让一个意想不到的话题，打开思路。';
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const result=nextTopic();const items=pool();let frame=0;const previews=reduced?[]:shuffle(items.filter(item=>item!==result)).slice(0,6);
    playSound('draw');
    const draw=()=>{
      if(frame>=previews.length){
        setTopic(result);state.spinning=false;state.selected=true;status('你的表达话题');$('topic-area').classList.remove('spinning');$('topic-area').classList.add('landed');
        $('topic-hint').textContent=state.mode==='research'?'从一个问题出发，形成你自己的观点。':'没有标准答案，说说你的理解就好。';
        state.drawTimeout=null;prepareRound();$('announcer').textContent='抽到的话题：'+result+'。点击开始准备后才会计时。';
        requestAnimationFrame(()=>$('timer-panel').scrollIntoView({block:'nearest',behavior:reduced?'instant':'smooth'}));return;
      }
      setTopic(previews[frame]);frame++;state.drawTimeout=setTimeout(draw,95);
    };draw();
  }
  $('spin').addEventListener('click',spin);
  $('guide-toggle').addEventListener('click',()=>{const expanded=$('guide-toggle').getAttribute('aria-expanded')==='true';$('guide-toggle').setAttribute('aria-expanded',String(!expanded));$('guide-content').hidden=expanded;});

  function updateSettingControls() {
    for(const [key,max] of [['speech',10],['research',60]]){
      const slider=$(key+'-duration');slider.value=settings[key];slider.style.setProperty('--fill',((settings[key]-1)/(max-1)*100)+'%');
      $(key+'-output').textContent=settings[key]+' 分钟';slider.setAttribute('aria-valuetext',settings[key]+' 分钟');
    }
    $('sound').checked=settings.sound;$('sound-test').disabled=!settings.sound;updateButtons();
    if(state.phase==='prepare-ready')prepareRound();
  }
  $('settings-open').addEventListener('click',()=>{updateSettingControls();$('settings-dialog').showModal()});
  for(const [key,max] of [['speech',10],['research',60]])$(key+'-duration').addEventListener('input',event=>{settings[key]=clampMinutes(Number(event.target.value),max,defaults[key]);persist();updateSettingControls();});
  $('sound').addEventListener('change',()=>{settings.sound=$('sound').checked;$('sound-test').disabled=!settings.sound;persist();if(settings.sound)playSound('land');});
  $('sound-test').addEventListener('click',async()=>{
    $('sound-test').disabled=true;
    const played=await playSound('done');
    if(played)$('sound-status').textContent='试听已播放。若没有听到，请调高媒体音量、关闭静音，或用系统浏览器打开。';
    $('sound-test').disabled=!settings.sound;
  });
  $('settings-dialog').addEventListener('click',event=>{if(event.target!==$('settings-dialog'))return;const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();});

  function stopClock() {clearInterval(state.interval);state.interval=null;}
  function startClock(deadline=Date.now()+state.remaining*1000) {stopClock();state.deadline=deadline;state.interval=setInterval(tick,100);}
  function format(seconds) {const rounded=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(rounded/60)).padStart(2,'0')}:${String(rounded%60).padStart(2,'0')}`;}
  function renderSteps() {
    const done=state.phase==='done';
    const step=Math.min(2,Math.floor((1-state.remaining/state.total)*3));
    Array.from($('speech-steps').children).forEach((item,index)=>{
      item.classList.toggle('current',!done&&index===step);item.classList.toggle('completed',done||index<step);
      if(!done&&index===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    });
  }
  function renderTimer() {
    const waiting=state.phase==='prepare-ready';const preparing=state.phase==='research';const ready=state.phase==='ready';const done=state.phase==='done';
    $('timer-panel').hidden=false;$('practice-panel').classList.add('has-timer');$('timer-panel').dataset.phase=state.phase;
    $('timer-phase').textContent=waiting||preparing?'01 / 准备':ready?'准备完成':done?'本次练习完成':'02 / 表达';
    $('timer-title').textContent=waiting?'点击开始准备':preparing?'准备倒计时':ready?'准备好了，再开始':done?'说完了，就是进步':'表达倒计时';
    $('timer-digits').textContent=format(ready?state.speechMinutes*60:state.remaining);$('timer-digits').setAttribute('aria-label',waiting?'待开始的准备时长':preparing?'准备剩余时间':ready?'待开始的表达时长':'表达剩余时间');
    $('timer-ring').style.setProperty('--progress',String(done?1:waiting||ready?0:Math.max(0,Math.min(1,1-state.remaining/state.total))));
    $('timer-caption').textContent=done?'给开口的自己一点掌声':waiting||ready?'尚未开始计时':state.paused?'已暂停，准备好了再继续':preparing?'整理思路，不用着急':'把你的想法说出来';
    $('timer-message').textContent=done?'每一次表达，都是一点进步。':waiting?'先看一看话题，点击下方按钮后开始准备。':ready?'准备已结束，点击下方按钮后开始表达。':state.paused?'计时已暂停，点击继续即可恢复。':preparing?`准备结束后，由你点击开始 ${state.speechMinutes} 分钟表达。`:'从一个观点开始，用一个例子展开。';
    $('speech-steps').hidden=waiting||preparing||ready;if(state.phase==='speech'||done)renderSteps();
    $('pause').hidden=waiting||done||ready;$('pause').textContent=state.paused?'继续计时':'暂停';
    $('phase-next').hidden=!(waiting||preparing||ready);$('phase-next').textContent=waiting?`开始 ${state.preparationMinutes} 分钟准备`:ready?`开始 ${state.speechMinutes} 分钟表达`:'结束准备';$('try-again').hidden=!done;
    const closeLabel=preparing?'结束准备计时':waiting||done||ready?'关闭本次练习':'结束表达计时';
    $('timer-close').setAttribute('aria-label',closeLabel);$('timer-close').title=closeLabel;
    updateButtons();
  }
  function resetTimer() {
    stopClock();state.phase='idle';state.paused=false;state.remaining=0;state.total=0;
    $('timer-panel').hidden=true;$('practice-panel').classList.remove('has-timer');updateButtons();
  }
  function prepareRound() {
    stopClock();state.phase='prepare-ready';state.paused=false;
    state.preparationMinutes=settings.research;state.speechMinutes=settings.speech;
    state.total=settings.research*60;state.remaining=state.total;state.deadline=0;
    renderTimer();
  }
  function finishPhase() {
    stopClock();state.remaining=0;state.paused=false;
    if(state.phase==='research'){
      finishPreparation();
      return;
    }
    state.phase='done';renderTimer();playSound('done');
  }
  function tick() {
    if(state.paused||!['research','speech'].includes(state.phase))return;
    state.remaining=Math.max(0,(state.deadline-Date.now())/1000);
    if(state.remaining<=0){finishPhase();return;}
    const digits=format(state.remaining);
    if($('timer-digits').textContent!==digits){$('timer-digits').textContent=digits;renderSteps();}
    $('timer-ring').style.setProperty('--progress',String(Math.max(0,Math.min(1,1-state.remaining/state.total))));
  }
  function beginPhase(phase) {
    stopClock();
    if(phase==='research'){state.preparationMinutes=settings.research;state.speechMinutes=settings.speech;}
    else if(state.phase==='done'){state.speechMinutes=settings.speech;}
    state.phase=phase;state.paused=false;state.total=(phase==='research'?state.preparationMinutes:state.speechMinutes)*60;
    state.deadline=Date.now()+state.total*1000;state.remaining=state.total;
    renderTimer();startClock(state.deadline);
  }
  function finishPreparation() {
    if(state.phase!=='research')return;
    stopClock();state.phase='ready';state.paused=false;state.remaining=0;
    renderTimer();playSound('done');
  }
  function startSpeech() {
    if(state.phase!=='ready')return;
    beginPhase('speech');$('pause').focus({preventScroll:true});playSound('land');
  }
  function togglePause() {
    if(!['research','speech'].includes(state.phase))return;
    if(state.paused){state.paused=false;startClock();playSound('land');}
    else {tick();if(!['research','speech'].includes(state.phase))return;state.paused=true;stopClock();}
    renderTimer();
  }
  function start() {
    if(!state.selected||state.spinning||$('settings-dialog').open)return;
    if(state.phase==='research'){finishPreparation();return;}
    if(state.phase==='ready'){startSpeech();return;}
    if(state.phase==='speech'){togglePause();return;}
    beginPhase(state.phase==='done'?'speech':'research');playSound('land');
  }
  $('start').addEventListener('click',start);
  $('pause').addEventListener('click',togglePause);
  $('phase-next').addEventListener('click',()=>{if(state.phase==='prepare-ready')start();else if(state.phase==='research')finishPreparation();else startSpeech();});
  $('try-again').addEventListener('click',()=>{beginPhase('speech');$('pause').focus({preventScroll:true});});
  $('timer-close').addEventListener('click',()=>{
    if(state.phase==='research'){finishPreparation();return;}
    resetTimer();$('spin').focus({preventScroll:true});
  });

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  document.addEventListener('keydown',event=>{
    if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||$('settings-dialog').open)return;
    if(event.target.closest('input,select,textarea,button,a,[contenteditable="true"]'))return;
    if(event.code==='Space'){event.preventDefault();spin();}else if(event.key==='Enter'){event.preventDefault();start();}
  });
  window.addEventListener('pagehide',()=>{stopClock();clearTimeout(state.drawTimeout);});
  window.addEventListener('pageshow',event=>{if(!event.persisted)return;if(state.spinning){state.spinning=false;state.selected=false;$('topic-area').classList.remove('spinning');status('灵感就绪');updateButtons();}if(['research','speech'].includes(state.phase)&&!state.paused){tick();if(['research','speech'].includes(state.phase))state.interval=setInterval(tick,100);}});
  persist();updateSettingControls();updateMode();
})();
