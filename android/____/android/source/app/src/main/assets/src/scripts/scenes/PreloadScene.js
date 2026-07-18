// PreloadScene - 预加载场景
export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        // 显示加载进度条
        this.createLoadingBar();

        // 创建占位图形
        this.createPlaceholderGraphics();

        // 模拟加载过程
        this.simulateLoading();
    }

    create() {
        // 加载完成后切换到角色选择场景
        this.time.delayedCall(1000, () => {
            this.scene.start('CharacterSelectScene');
        });
    }

    createLoadingBar() {
        // 创建加载进度条
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // 背景
        this.add.graphics().fillStyle(0x222222, 1).fillRect(0, 0, width, height);

        // 加载文本
        this.loadingText = this.add.text(width / 2, height / 2 - 50, '加载中...', {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // 进度条背景
        this.progressBarBg = this.add.graphics();
        this.progressBarBg.fillStyle(0x444444, 1);
        this.progressBarBg.fillRoundedRect(
            width / 2 - 200,
            height / 2 + 50,
            400,
            30,
            15
        );

        // 进度条
        this.progressBar = this.add.graphics();
    }

    simulateLoading() {
        // 模拟加载过程
        let progress = 0;
        const interval = setInterval(() => {
            progress += 0.05;
            this.updateProgressBar(progress);

            if (progress >= 1) {
                clearInterval(interval);
                this.loadingText.setText('加载完成!');
            }
        }, 200);
    }

    updateProgressBar(progress) {
        this.progressBar.clear();
        this.progressBar.fillStyle(0xffffff, 1);
        this.progressBar.fillRoundedRect(
            this.cameras.main.width / 2 - 190,
            this.cameras.main.height / 2 + 55,
            380 * progress,
            20,
            10
        );
    }

    // 创建占位图形的方法
    createPlaceholderGraphics() {
        // 创建背景
        const bg = this.add.graphics();
        bg.fillStyle(0x222222, 1);
        bg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

        // 创建角色占位图
        this.createCharacterPlaceholder('qiqui', 0xffa500); // 橙色
        this.createCharacterPlaceholder('miaomiao', 0x9370db); // 紫色

        // 创建UI元素占位图
        this.createButtonPlaceholder('button');
        this.createButtonPlaceholder('button_pressed');

        // 创建关卡背景占位图
        this.createLevelBgPlaceholder('level_bg');
        this.createLevelBgPlaceholder('puzzle_bg');

        // 创建logo占位图
        this.createLogoPlaceholder('logo');

        // 创建怪物占位图
        this.createMonsterPlaceholder();

        // 创建障碍物和零件占位图
        this.createObstaclePlaceholder('rock');
        this.createObstaclePlaceholder('vine');
        this.createObstaclePlaceholder('puddle');
        this.createObstaclePlaceholder('part');

        // 创建音效占位（空音频）
        this.createAudioPlaceholder();

        return bg;
    }

    createCharacterPlaceholder(key, color) {
        const graphics = this.add.graphics();
        graphics.fillStyle(color, 1);
        graphics.fillCircle(100, 100, 50);
        // 添加简单的面部特征
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(85, 90, 5); // 左眼
        graphics.fillCircle(115, 90, 5); // 右眼
        graphics.fillStyle(0xff0000, 1);
        graphics.fillEllipse(100, 110, 15, 5); // 嘴巴
        this.textures.addCanvas(key, graphics.canvas, true);
        graphics.destroy();
    }

    createButtonPlaceholder(key) {
        const graphics = this.add.graphics();
        graphics.fillStyle(0x4169e1, 1);
        graphics.fillRoundedRect(0, 0, 200, 80, 20);
        this.textures.addCanvas(key, graphics.canvas, true);
        graphics.destroy();
    }

    createLevelBgPlaceholder(key) {
        const graphics = this.add.graphics();
        graphics.fillStyle(0x333333, 1);
        graphics.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        this.textures.addCanvas(key, graphics.canvas, true);
        graphics.destroy();
    }

    createLogoPlaceholder(key) {
        const graphics = this.add.graphics();
        graphics.fillStyle(0xff69b4, 1);
        graphics.fillRoundedRect(0, 0, 400, 200, 20);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillText('奇迹森林大冒险', 200, 100, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff',
            align: 'center'
        });
        this.textures.addCanvas(key, graphics.canvas, true);
        graphics.destroy();
    }

    createMonsterPlaceholder() {
        const graphics = this.add.graphics();
        graphics.fillStyle(0xff69b4, 1); // 粉红色
        graphics.fillCircle(100, 100, 60);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(80, 80, 10); // 左眼
        graphics.fillCircle(120, 80, 10); // 右眼
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(80, 80, 5); // 左眼珠
        graphics.fillCircle(120, 80, 5); // 右眼珠
        graphics.fillStyle(0xff69b4, 1);
        graphics.fillEllipse(100, 120, 30, 15); // 嘴巴
        this.textures.addCanvas('monster', graphics.canvas, true);
        graphics.destroy();
    }

    createObstaclePlaceholder(key) {
        const graphics = this.add.graphics();
        if (key === 'rock') {
            graphics.fillStyle(0x808080, 1);
            graphics.fillCircle(50, 50, 30);
        } else if (key === 'vine') {
            graphics.fillStyle(0x228b22, 1);
            graphics.fillRect(40, 0, 20, 100);
        } else if (key === 'puddle') {
            graphics.fillStyle(0x1e90ff, 1);
            graphics.fillEllipse(50, 50, 40, 20);
        } else if (key === 'part') {
            graphics.fillStyle(0xffd700, 1);
            graphics.fillStar(50, 50, 5, 20, 10);
        }
        this.textures.addCanvas(key, graphics.canvas, true);
        graphics.destroy();
    }

    createAudioPlaceholder() {
        // 创建空白音频占位
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = audioContext.createBuffer(1, 1, 22050);
        this.game.cache.audio.add('click', buffer);
        this.game.cache.audio.add('correct', buffer);
        this.game.cache.audio.add('wrong', buffer);
        this.game.cache.audio.add('jump', buffer);
        this.game.cache.audio.add('slide', buffer);
        this.game.cache.audio.add('collect', buffer);
        this.game.cache.audio.add('hit', buffer);
        this.game.cache.audio.add('attack', buffer);
        this.game.cache.audio.add('monster_roar', buffer);
        this.game.cache.audio.add('heartbeat', buffer);
        this.game.cache.audio.add('chase_bgm', buffer);
        this.game.cache.audio.add('bgm', buffer);
    }
}