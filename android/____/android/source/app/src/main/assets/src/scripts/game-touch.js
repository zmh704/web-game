// ============================================================
// 移动端触摸控制
// ============================================================
var IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('is-touch');

function setupTouchControls() {
    if (!IS_TOUCH) return;
    document.getElementById('touch-controls').style.display = 'block';

    var joyZone = document.getElementById('joystick-zone');
    var knob = document.getElementById('joystick-knob');
    var joyId = null, joyCX = 0, joyCY = 0, joyMax = 38;
    function setMoveKeys(nx, ny) { keys['w'] = ny < -0.35; keys['s'] = ny > 0.35; keys['a'] = nx < -0.35; keys['d'] = nx > 0.35; }
    function findTouch(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].identifier === id) return list[i]; } return null; }
    joyZone.addEventListener('touchstart', function (e) {
        e.preventDefault();
        if (joyId !== null) return;
        var t = e.changedTouches[0]; joyId = t.identifier;
        var r = joyZone.getBoundingClientRect();
        joyCX = r.left + r.width / 2; joyCY = r.top + r.height / 2; joyMax = r.width / 2 - 27;
    }, { passive: false });
    joyZone.addEventListener('touchmove', function (e) {
        e.preventDefault();
        var t = findTouch(e.changedTouches, joyId); if (!t) return;
        var dx = t.clientX - joyCX, dy = t.clientY - joyCY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > joyMax) { dx = dx / dist * joyMax; dy = dy / dist * joyMax; }
        knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
        setMoveKeys(dx / joyMax, dy / joyMax);
    }, { passive: false });
    function joyEnd(e) {
        e.preventDefault();
        if (!findTouch(e.changedTouches, joyId)) return;
        joyId = null; setMoveKeys(0, 0);
        knob.style.transform = 'translate(-50%,-50%)';
    }
    joyZone.addEventListener('touchend', joyEnd, { passive: false });
    joyZone.addEventListener('touchcancel', joyEnd, { passive: false });

    var lookZone = document.getElementById('touch-look-zone');
    var lookId = null, lastX = 0, lastY = 0;
    lookZone.addEventListener('touchstart', function (e) {
        e.preventDefault();
        if (lookId !== null) return;
        var t = e.changedTouches[0]; lookId = t.identifier; lastX = t.clientX; lastY = t.clientY;
    }, { passive: false });
    lookZone.addEventListener('touchmove', function (e) {
        e.preventDefault();
        var t = findTouch(e.changedTouches, lookId); if (!t) return;
        targetMouse.x -= (t.clientX - lastX) * 0.012;
        targetMouse.y = 0;
        lastX = t.clientX; lastY = t.clientY;
    }, { passive: false });
    function lookEnd(e) { e.preventDefault(); if (findTouch(e.changedTouches, lookId)) lookId = null; }
    lookZone.addEventListener('touchend', lookEnd, { passive: false });
    lookZone.addEventListener('touchcancel', lookEnd, { passive: false });

    function bindBtn(id, fn) {
        document.getElementById(id).addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive: false });
    }
    bindBtn('btn-attack', attack);
    bindBtn('btn-jump', tryJump);
    bindBtn('btn-skill', useSkill);
}