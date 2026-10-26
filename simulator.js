(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MicrowaveSimulator = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const MAX_SECONDS = 6039;
  const DEFROST_SECONDS_PER_LB = 300;
  // 这些时长仅用于交互演示，不是制造商食谱，也不能指导真实烹饪。
  const foods = [
    { id: 'dinner-plate', name: 'Dinner Plate', portions: [1, 2], unit: 'cup', portionLabels: ['1 CUP', '2 CUPS'], secondsPerPortion: 90, power: 100 },
    { id: 'pizza', name: 'Pizza', portions: [1, 2], unit: 'slice', portionLabels: ['1 SLICE', '2 SLICES'], secondsPerPortion: 45, power: 100 },
    { id: 'reheat', name: 'Reheat', portions: [1, 2], unit: 'cup', portionLabels: ['1 CUP', '2 CUPS'], secondsPerPortion: 60, power: 100 },
    { id: 'potato', name: 'Potato', portions: [1, 2, 3], unit: 'potato', portionLabels: ['1 POTATO', '2 POTATOES', '3 POTATOES'], secondsPerPortion: 120, power: 100 },
    { id: 'popcorn', name: 'Popcorn', portions: [1.75, 3, 3.5], unit: 'oz', portionLabels: ['1.75 OZ', '3.0 OZ', '3.5 OZ'], secondsPerPortion: 50, power: 100 },
    { id: 'beverage', name: 'Beverage', portions: [1, 2], unit: 'cup', portionLabels: ['1 CUP', '2 CUPS'], secondsPerPortion: 45, power: 100 },
    { id: 'vegetable', name: 'Vegetable', portions: [1, 2, 3, 4], unit: 'cup', portionLabels: ['1 CUP', '2 CUPS', '3 CUPS', '4 CUPS'], secondsPerPortion: 60, power: 100 }
  ];
  foods.forEach(food => {
    Object.freeze(food.portions);
    Object.freeze(food.portionLabels);
    Object.freeze(food);
  });
  Object.freeze(foods);

  function formatTime(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  function formatDigits(digits) {
    const value = String(digits || '').padStart(4, '0');
    return `${value.slice(0, 2)}:${value.slice(2)}`;
  }

  function formatClock(state, now = Date.now()) {
    let minutes;
    if (state.clockMinutes === null) {
      const date = new Date(now);
      minutes = date.getHours() * 60 + date.getMinutes();
    } else {
      minutes = (state.clockMinutes + Math.floor((now - state.clockSetAt) / 60000)) % 1440;
    }
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function initialState() {
    return {
      mode: 'cook', phase: 'idle', seconds: 0, programSeconds: 0, power: 100,
      timeDigits: '0000', inputFresh: true, foodId: null, portions: 1,
      defrostType: 'weight', weightLb: 1,
      timerSeconds: 0, timerPhase: 'idle', timerMessage: '',
      sound: true, clockMinutes: null, clockSetAt: 0, clockVisible: true,
      locked: false, message: 'Set a cooking time.', error: ''
    };
  }

  /**
   * 每个面板持有独立实例。dispatch 与 tick 返回同一个可读 state。
   * 食品时长为 secondsPerPortion × portions；解冻默认每磅 300 秒、30% 功率。
   * 可用 create({ foodDurations: { pizza: 55 }, defrostSecondsPerLb: 300 }) 调整演示参数。
   * 厨房计时：setTimer(seconds) 保存，再 startTimer() 开始；stopTimer() 清除。
   * 时钟：setClock(从午夜起的分钟数)，formatClock(state, now) 返回 24 小时读数。
   */
  function create(options = {}) {
    const state = initialState();
    const foodDurations = options.foodDurations || {};
    const defrostRate = options.defrostSecondsPerLb ?? DEFROST_SECONDS_PER_LB;
    if (!Number.isFinite(defrostRate) || defrostRate <= 0 || defrostRate * 6 > MAX_SECONDS) {
      throw new RangeError('Defrost demonstration duration must fit 0.1–6 lb within 6039 seconds.');
    }
    for (const food of foods) {
      const duration = foodDurations[food.id] ?? food.secondsPerPortion;
      if (!Number.isFinite(duration) || duration <= 0 || duration * food.portions.at(-1) > MAX_SECONDS) {
        throw new RangeError(`Invalid demonstration duration for ${food.name}.`);
      }
    }
    let heatDeadline = null;
    let heatRemainingMs = 0;
    let timerDeadline = null;
    let rawDigits = '';

    const fail = message => {
      state.error = message;
      state.message = message;
      return state;
    };

    function syncDigits() {
      // 99:60 至 99:99 保留四位输入能力；运行时用 formatTime 显示真实分秒。
      const minutes = Math.min(99, Math.floor(state.seconds / 60));
      rawDigits = `${minutes}${String(state.seconds - minutes * 60).padStart(2, '0')}`.replace(/^0+/, '');
      state.timeDigits = rawDigits.padStart(4, '0');
    }

    function finishHeat() {
      heatDeadline = null;
      heatRemainingMs = 0;
      state.seconds = 0;
      state.phase = 'done';
      state.inputFresh = true;
      syncDigits();
      state.message = 'Heating complete.';
    }

    function tick(now = Date.now()) {
      if (state.phase === 'running') {
        heatRemainingMs = Math.max(0, heatDeadline - now);
        state.seconds = Math.ceil(heatRemainingMs / 1000);
        if (!heatRemainingMs) finishHeat();
      }
      if (state.timerPhase === 'running') {
        state.timerSeconds = Math.max(0, Math.ceil((timerDeadline - now) / 1000));
        if (!state.timerSeconds) {
          timerDeadline = null;
          state.timerPhase = 'done';
          state.timerMessage = 'Kitchen timer complete.';
        }
      }
      return state;
    }

    function clearHeat() {
      heatDeadline = null;
      heatRemainingMs = 0;
      rawDigits = '';
      Object.assign(state, {
        mode: 'cook', phase: 'idle', seconds: 0, programSeconds: 0, power: 100,
        timeDigits: '0000', inputFresh: true, foodId: null, portions: 1,
        defrostType: 'weight', weightLb: 1
      });
    }

    function setTime(seconds, now, preserveInput = false) {
      state.seconds = seconds;
      state.programSeconds = seconds;
      heatRemainingMs = seconds * 1000;
      if (state.phase === 'running') {
        heatDeadline = now + heatRemainingMs;
        if (!seconds) finishHeat();
      } else if (state.phase === 'done' || !seconds) {
        state.phase = 'idle';
      }
      if (!preserveInput) {
        syncDigits();
        state.inputFresh = true;
      }
    }

    function changeMode(mode, now) {
      if (!['cook', 'food', 'defrost'].includes(mode)) return fail('Choose Cook Time, Food Menu or Defrost.'), false;
      if (state.phase === 'running') return fail('Pause heating before changing the program.'), false;
      if (state.mode === mode && state.phase !== 'done') return true;
      clearHeat();
      state.mode = mode;
      if (mode === 'defrost') {
        state.power = 30;
        setTime(Math.round(state.weightLb * defrostRate), now);
      }
      return true;
    }

    function start(now) {
      if (state.phase === 'running') return;
      if (!state.seconds) return fail('NO TIME SET · Enter a time before starting.');
      if (state.mode === 'food' && !state.foodId) return fail('CHOOSE FOOD · Select a food before starting.');
      heatDeadline = now + heatRemainingMs;
      state.phase = 'running';
      state.inputFresh = true;
      syncDigits();
      state.message = 'Heating.';
    }

    function pause(now) {
      if (state.phase !== 'running') return;
      heatRemainingMs = Math.max(0, heatDeadline - now);
      heatDeadline = null;
      state.phase = 'paused';
      state.inputFresh = true;
      syncDigits();
      state.message = 'Paused. Press Start to resume.';
    }

    function setFoodPortions(food, portions, now) {
      state.portions = portions;
      state.phase = 'idle';
      heatDeadline = null;
      const duration = foodDurations[food.id] ?? food.secondsPerPortion;
      setTime(Math.round(duration * portions), now);
      state.message = `${food.name} selected. Press Start.`;
    }

    function dispatch(action, value, now = Date.now()) {
      tick(now);
      state.error = '';
      if (state.locked && !['unlock', 'reset', 'lock'].includes(action)) {
        return fail('LOC · Hold Cancel / Off for 3 seconds to unlock.');
      }
      switch (action) {
        case 'digit': {
          if (!/^\d$/.test(String(value))) return fail('Enter one digit from 0 to 9.');
          if (state.phase === 'running') return fail('Pause heating before entering a new time.');
          if (state.inputFresh) rawDigits = '';
          if (rawDigits.length >= 4) return fail('TIME FULL · Delete a digit or finish this entry.');
          rawDigits += String(value);
          state.timeDigits = rawDigits.padStart(4, '0');
          state.inputFresh = false;
          const digits = state.timeDigits;
          setTime(Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)), now, true);
          state.message = 'Time entered. Press Start when ready.';
          break;
        }
        case 'delete':
          if (state.phase === 'running') return fail('Pause heating before editing time.');
          rawDigits = rawDigits.slice(0, -1);
          state.timeDigits = rawDigits.padStart(4, '0');
          state.inputFresh = false;
          setTime(Number(state.timeDigits.slice(0, 2)) * 60 + Number(state.timeDigits.slice(2)), now, true);
          state.message = 'Last digit deleted.';
          break;
        case 'clear':
          if (state.phase === 'running') return fail('Pause heating before clearing time, or press Cancel.');
          setTime(0, now);
          state.message = 'Time cleared. Power retained.';
          break;
        case 'completeInput':
          state.inputFresh = true;
          state.message = 'Time saved. Press Start when ready.';
          break;
        case 'setTime':
          if (!Number.isFinite(value) || !Number.isInteger(value)) return fail('Enter a whole number of seconds.');
          if (value > MAX_SECONDS) return fail('MAX TIME · The limit is 99:99.');
          setTime(Math.max(0, value), now);
          state.message = state.phase === 'done' ? 'Heating complete.' : 'Cooking time updated.';
          break;
        case 'adjustTime': {
          if (!Number.isFinite(value) || !Number.isInteger(value)) return fail('Adjust time by a whole number of seconds.');
          if (state.seconds + value > MAX_SECONDS) return fail('MAX TIME · The limit is 99:99.');
          const remainingMs = Math.max(0, heatRemainingMs + value * 1000);
          setTime(Math.ceil(remainingMs / 1000), now);
          heatRemainingMs = remainingMs;
          if (state.phase === 'running') heatDeadline = now + remainingMs;
          state.message = state.phase === 'done' ? 'Heating complete.' : 'Cooking time updated.';
          break;
        }
        case 'setPower':
          if (!Number.isInteger(value) || value < 10 || value > 100) return fail('Choose a power from 10% to 100%.');
          state.power = value;
          state.inputFresh = true;
          state.message = `Power set to ${value}%.`;
          break;
        case 'setMode':
          if (!changeMode(value, now)) return state;
          state.message = value === 'food' ? 'Choose a food and portion, then press Start.' : value === 'defrost' ? 'Choose weight or time, then press Start.' : 'Set a cooking time.';
          break;
        case 'start':
          start(now);
          break;
        case 'pause':
          pause(now);
          break;
        case 'toggleStart':
          if (state.phase === 'running') pause(now);
          else start(now);
          break;
        case 'cancel':
          clearHeat();
          state.message = 'Cooking cancelled.';
          break;
        case 'quick30':
          if (state.phase === 'running' || state.phase === 'paused') return dispatch('adjustTime', 30, now);
          clearHeat();
          setTime(30, now);
          start(now);
          break;
        case 'selectFood': {
          const food = foods.find(item => item.id === value);
          if (!food) return fail('Choose a listed food program.');
          if (!changeMode('food', now)) return state;
          state.foodId = food.id;
          state.power = food.power;
          setFoodPortions(food, food.portions[0], now);
          break;
        }
        case 'setPortions': {
          const food = foods.find(item => item.id === state.foodId);
          if (!food) return fail('CHOOSE FOOD · Select a food before choosing portions.');
          if (state.phase === 'running') return fail('Pause heating before changing portions.');
          if (!food.portions.includes(value)) return fail('Choose one of the listed portions.');
          setFoodPortions(food, value, now);
          break;
        }
        case 'setDefrostType':
          if (!['weight', 'time'].includes(value)) return fail('Choose defrost by weight or time.');
          if (state.mode === 'defrost' && state.defrostType === value && state.phase !== 'running') break;
          if (!changeMode('defrost', now)) return state;
          state.defrostType = value;
          state.phase = 'idle';
          state.power = 30;
          setTime(value === 'weight' ? Math.round(state.weightLb * defrostRate) : 0, now);
          state.message = value === 'weight' ? 'Set a weight from 0.1 to 6 lb.' : 'Enter a defrost time, then press Start.';
          break;
        case 'setWeight':
          if (!Number.isFinite(value) || value < 0.1 || value > 6) return fail('Choose a weight from 0.1 to 6 lb.');
          if (!changeMode('defrost', now)) return state;
          state.weightLb = value;
          state.defrostType = 'weight';
          state.phase = 'idle';
          state.power = 30;
          setTime(Math.round(value * defrostRate), now);
          state.message = 'Defrost weight set. Press Start.';
          break;
        case 'setTimer':
          if (!Number.isInteger(value) || value < 0 || value > MAX_SECONDS) return fail('Set a timer from 00:00 to 99:99.');
          timerDeadline = null;
          state.timerSeconds = value;
          state.timerPhase = 'idle';
          state.timerMessage = 'Timer set. Start the timer to begin.';
          state.message = state.timerMessage;
          break;
        case 'startTimer':
          if (!state.timerSeconds) return fail('NO TIMER SET · Enter a timer duration.');
          if (state.timerPhase !== 'running') timerDeadline = now + state.timerSeconds * 1000;
          state.timerPhase = 'running';
          state.timerMessage = 'Kitchen timer running.';
          state.message = state.timerMessage;
          break;
        case 'stopTimer':
          timerDeadline = null;
          state.timerSeconds = 0;
          state.timerPhase = 'idle';
          state.timerMessage = 'Kitchen timer stopped.';
          state.message = state.timerMessage;
          break;
        case 'setSound':
          if (typeof value !== 'boolean') return fail('Choose sound on or off.');
          state.sound = value;
          state.message = value ? 'Sound on.' : 'Sound off.';
          break;
        case 'setClock':
          if (!Number.isInteger(value) || value < 0 || value >= 1440) return fail('Enter a valid 24-hour time.');
          state.clockMinutes = value;
          state.clockSetAt = now;
          state.message = 'Clock set.';
          break;
        case 'toggleClock':
          state.clockVisible = !state.clockVisible;
          state.message = state.clockVisible ? 'Clock display on.' : 'Clock display off.';
          break;
        case 'lock':
          if (!['idle', 'done'].includes(state.phase)) return fail('Stop cooking before locking the controls.');
          state.locked = true;
          state.message = 'LOC · Controls locked.';
          break;
        case 'unlock':
          state.locked = false;
          state.message = 'Controls unlocked.';
          break;
        case 'reset':
          heatDeadline = null;
          heatRemainingMs = 0;
          timerDeadline = null;
          rawDigits = '';
          Object.assign(state, initialState());
          break;
        default:
          fail('Unknown control action.');
      }
      return state;
    }

    return { state, dispatch, tick };
  }

  return { create, formatTime, formatDigits, formatClock, foods, MAX_SECONDS, DEFROST_SECONDS_PER_LB };
}));
