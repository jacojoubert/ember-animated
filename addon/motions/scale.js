import Motion from '../motion';
import Tween from '../tween';
import { rAF } from '../concurrency-helpers';

export default class Scale extends Motion {
  constructor(sprite, opts) {
    super(sprite, opts);
    this.widthTween = null;
    this.heightTween = null;
    if (opts && opts.duration != null) {
      this.duration = opts.duration;
    }
  }

  * animate() {
    let sprite = this.sprite;
    let duration = this.duration;

    let widthFactor = sprite.finalBounds.width / sprite.initialBounds.width;
    let heightFactor = sprite.finalBounds.height / sprite.initialBounds.height;

    this.widthTween = new Tween(sprite.transform.a, sprite.transform.a * widthFactor, duration);
    this.heightTween = new Tween(sprite.transform.d, sprite.transform.d * heightFactor, duration);

    while (true) {
      yield rAF();
      sprite.scale(this.widthTween.currentValue / sprite.transform.a, this.heightTween.currentValue / sprite.transform.d);
      if (this.widthTween.done && this.heightTween.done) {
        break;
      }
    }
  }
}
