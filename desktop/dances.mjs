// Each beat updates the root and the independently articulated paws.
const tau = Math.PI * 2;
const sin = Math.sin;
const pulse = phase => (1 - Math.cos(phase)) / 2;

export function applyDance(id, time, weight, {lion,head,tail,arms,feet}) {
  const bpm = id === 'subject3' ? 136 : id === 'fairy' ? 112 : 120;
  const beat = time * bpm / 60;
  const phase = beat * Math.PI;
  const sway = sin(phase);
  const bounce = pulse(phase * 2);
  if (id === 'subject3') {
    lion.position.x += .27 * sway * weight;
    lion.position.y += (.045 + .085 * bounce) * weight;
    lion.rotation.y += .34 * sway * weight;
    lion.rotation.z -= .13 * sway * weight;
    head.rotation.z += .09 * sway * weight;
    for (let i=0;i<2;i++) {
      const side = i*2-1, wave = phase + i*Math.PI;
      arms[i].rotation.set((-1.18 + .55*sin(wave*2))*weight,
        .56*sin(wave*2 + 1.1)*weight, side*(.78+.38*sin(wave))*weight);
      feet[i].position.x = side*.41 + (.13*sway + side*.10*pulse(wave))*weight;
      feet[i].position.y = .22 + .15*Math.max(0,sin(wave))*weight;
      feet[i].rotation.z = (.48*sway - side*.13)*weight;
      feet[i].rotation.y = .27*sin(wave)*weight;
    }
  } else if (id === 'fairy') {
    lion.position.x += .19 * sway * weight;
    lion.position.y += .10 * bounce * weight;
    lion.rotation.z += .12*sway*weight;
    lion.rotation.y += .21*sin(phase/2)*weight;
    head.rotation.z -= .15*sway*weight;
    for (let i=0;i<2;i++) {
      const side = i*2-1, wave = phase+i*Math.PI;
      arms[i].rotation.set((-1.05-.72*pulse(wave))*weight,
        side*.32*sin(wave)*weight, side*(.47+.63*pulse(wave))*weight);
      feet[i].position.y = .22 + .10*pulse(wave)*weight;
      feet[i].rotation.x = .20*sin(wave)*weight;
    }
  } else if (id === 'crisp') {
    // Chest cross, shoulder accents, opening gesture, then paws on hips.
    const gesture = beat % 8;
    const cross = pulse(gesture * tau/4);
    const opening = pulse((gesture-4) * tau/8);
    lion.position.y += .075*bounce*weight;
    lion.rotation.y += .19*sway*weight;
    lion.rotation.x += .15*cross*weight;
    head.rotation.z += .18*sin(phase/2)*weight;
    for (let i=0;i<2;i++) {
      const side = i*2-1;
      arms[i].rotation.set((-1.1-.58*cross)*weight,
        -side*.55*cross*weight, side*(.25+.95*opening-.80*cross)*weight);
      feet[i].rotation.y = side*.15*bounce*weight;
    }
  }
  tail.rotation.y += .32*sin(phase)*weight;
}
