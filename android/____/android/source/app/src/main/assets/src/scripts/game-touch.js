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

    // 视角控制区：不覆盖右上角HUD按钮（退出按钮）
    var lookZone = document.getElementById('touch-look-zone');
    var lookId = null, lastX = 0, lastY = 0;
    // 限制视角区不拦截右上角退出按钮的点击区域（右上方约80px区域）
    var hudRightRect = null;
    function getHudRightRect() {
        var el = document.getElementById('hud-right');
        if (el) {
            var r = el.getBoundingClientRect();
            hudRightRect = { right: r.right, top: r.top, bottom: r.bottom, left: r.left };
        }
    }
    function isInHudRight(x, y) {
        if (!hudRightRect) return false;
        return x >= hudRightRect.left && x <= hudRightRect.right && y >= hudRightRect.top && y <= hudRightRect.bottom;
    }
    lookZone.addEventListener('touchstart', function (e) {
        e.preventDefault();
        getHudRightRect();
        if (lookId !== null) return;
        var t = e.changedTouches[0];
        // 如果触摸点在HUD按钮区域，不拦截
        if (isInHudRight(t.clientX, t.clientY)) return;
        lookId = t.identifier; lastX = t.clientX; lastY = t.clientY;
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
    bindBtn('btn-flashlight', toggleFlashlight);

    // 退出按钮单独绑定touch事件（HUD区域）
    var backBtn = document.getElementById('hud-back-btn');
    if (backBtn) {
        backBtn.addEventListener('touchstart', function (e) {
            e.stopPropagation();
            backToMainMenu();
        }, { passive: false });
    }
}