// BootScene - 游戏启动场景
class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        // 由于没有实际图片资源，我们将在create方法中创建占位图形
    }

    create() {
        // 设置游戏全局设置
        this.setupGameSettings();

        // 创建占位背景
        this.createPlaceholderGraphics();

        // 切换到预加载场景
        this.scene.start('PreloadScene');
    }

    setupGameSettings() {
        // 设置游戏全局设置
        this.game.config.roundPixels = true;
        this.game.config.antialias = false;

        // 设置默认字体
        this.game.config.defaultFont = {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        };
    }

    createPlaceholderGraphics() {
        // 创建一个简单的图形占位符
        const graphics = this.add.graphics();
        graphics.fillStyle(0x333333, 1);
        graphics.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

        // 创建加载文本
        this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            '加载中...',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        return graphics;
    }
}
