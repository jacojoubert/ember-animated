import Ember from 'ember';
import layout from '../templates/components/animated-each';
import { task } from 'ember-concurrency';
import { afterRender } from '../concurrency-helpers';
import TransitionContext from '../transition-context';

export default Ember.Component.extend({
  layout,
  tagName: '',
  motionService: Ember.inject.service('-ea-motion'),
  duration: 2000,

  init() {
    this._enteringComponents = [];
    this._currentComponents = [];
    this._leavingComponents = [];
    this._removalMotions = new Map();
    this._prevItems = [];
    this._firstTime = true;
    this.get('motionService').register(this);
    this._super();
  },

  isAnimating: Ember.computed.alias('animate.isRunning'),

  willDestroyElement() {
    let removedSprites = flatMap(this._currentComponents, component => component.sprites());
    removedSprites.forEach(sprite => sprite.measureInitialBounds());
    for (let sprite of this._removalMotions.keys()) {
      removedSprites.push(sprite);
    }
    this.get('motionService.farMatch').perform([], removedSprites);
    this.get('motionService').unregister(this);
  },

  didReceiveAttrs() {
    let prevItems = this._prevItems;
    let items = this.get('items') || [];
    this._prevItems = items.slice();

    let firstTime = this._firstTime;
    this._firstTime = false;

    let transition = this._transitionFor(firstTime, prevItems, items);
    this.set('willTransition', !!transition);
    if (!transition) { return; }

    this._notifyContainer('lock');

    let currentSprites = flatMap(this._currentComponents, component => component.sprites());
    currentSprites.forEach(sprite => sprite.measureInitialBounds());
    currentSprites.forEach(sprite => sprite.lock());
    this.get('animate').perform(currentSprites, transition);
  },

  animate: task(function * (currentSprites, transition) {
    yield afterRender();

    let [keptSprites, removedSprites] = partition(
      currentSprites,
      sprite => this._leavingComponents.indexOf(sprite.component) < 0
    );

    for (let sprite of this._removalMotions.keys()) {
      removedSprites.push(sprite);
    }

    // Briefly unlock everybody
    keptSprites.forEach(sprite => sprite.unlock());
    // so we can measure the final static layout
    let insertedSprites = flatMap(this._enteringComponents, component => component.sprites());
    insertedSprites.forEach(sprite => sprite.measureFinalBounds());
    keptSprites.forEach(sprite => sprite.measureFinalBounds());
    this._notifyContainer('measure', { duration: this.get('duration') });

    // Update our permanent state so that if we're interrupted after
    // this point we are already consistent. AFAIK, we can't be
    // interrupted before this point because Ember won't fire
    // `didReceiveAttrs` multiple times before `afterRender` happens.
    this._updateComponentLists();

    // Then lock everything down
    keptSprites.forEach(sprite => sprite.lock());
    insertedSprites.forEach(sprite => sprite.lock());

    let farMatches = yield this.get('motionService.farMatch').perform(insertedSprites, removedSprites);

    // any removed sprites that matched elsewhere will get handled elsewhere
    removedSprites = removedSprites.filter(sprite => !farMatches.get(sprite))

    let context = new TransitionContext(this.get('duration'), insertedSprites, keptSprites, removedSprites, farMatches, this._removalMotions);
    yield * context._runToCompletion(transition);

    this._notifyContainer('unlock');
  }).restartable(),

  _updateComponentLists() {
    this._currentComponents = this._currentComponents.concat(this._enteringComponents)
      .filter(c => this._leavingComponents.indexOf(c) === -1);
    this._enteringComponents = [];
    this._leavingComponents = [];
  },

  _notifyContainer(method, opts) {
    var target = this.get('notify');
    if (target && target[method]) {
      return target[method](opts);
    }
  },

  _transitionFor(firstTime, oldItems, newItems) {
    let rules = this.get('rules');
    if (!rules) {
      return null;
    }
    return rules(firstTime, oldItems, newItems);
  },

  actions: {
    childEntering(component) {
      this._enteringComponents.push(component);
    },
    childLeaving(component) {
      this._leavingComponents.push(component);
    }
  }

}).reopenClass({
  positionalParams: ['items']
});


function partition(list, pred) {
  let matched = [];
  let unmatched = [];
  list.forEach(entry => {
    if (pred(entry)) {
      matched.push(entry);
    } else {
      unmatched.push(entry);
    }
  });
  return [matched, unmatched];
}

function flatMap(list, fn) {
  let results = [];
  for (let i = 0; i < list.length; i++) {
    results.push(fn(list[i]));
  }
  return [].concat(...results);
}
