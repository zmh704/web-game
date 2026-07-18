// DifficultySelectScene - 难度选择场景
export class DifficultySelectScene extends Phaser.Scene {
    constructor() {
        super({ key: 'DifficultySelectScene' });
    }

    create() {
        // 创建背景
        this.createBackground();

        // 创建标题
        this.createTitle();

        // 创建难度选择UI
        this.createDifficultySelection();

        // 创建返回按钮
        this.createBackButton();

        // 创建音效
        this.createSounds();
    }

    createBackground() {
        // 创建背景
        this.add.image(0, 0, 'background').setOrigin(0, 0).setDisplaySize(
            this.cameras.main.width,
            this.cameras.main.height
        );

        // 添加装饰元素
        this.add.text(this.cameras.main.width / 2, 100, '选择难度', {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    createTitle() {
        // 显示当前选择的角色
        const characterName = window.gameState.selectedCharacter === 'qiqui' ? '奇奇' : '妙妙';
        this.add.text(
            this.cameras.main.width / 2,
            200,
            `${characterName}，你想挑战哪个森林？`,
            {
                fontFamily: 'Arial',
                fontSize: '36px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);
    }

    createDifficultySelection() {
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2 + 50;

        // 创建难度卡片
        const primaryCard = this.createDifficultyCard(
            centerX - 250,
            centerY,
            '初级',
            '学前班-一年级\n适合5-6岁小朋友',
            0x7cfc00, // 绿色
            'primary'
        );

        const mediumCard = this.createDifficultyCard(
            centerX,
            centerY,
            '中级',
            '二年级-三年级\n适合7-8岁小朋友',
            0xffa500, // 橙色
            'medium'
        );

        const advancedCard = this.createDifficultyCard(
            centerX + 250,
            centerY,
            '高级',
            '四年级-五年级\n适合9-10岁小朋友',
            0xff4500, // 红色
            'advanced'
        );

        // 添加点击事件
        primaryCard.setInteractive().on('pointerdown', () => {
            this.selectDifficulty('primary');
        });

        mediumCard.setInteractive().on('pointerdown', () => {
            this.selectDifficulty('medium');
        });

        advancedCard.setInteractive().on('pointerdown', () => {
            this.selectDifficulty('advanced');
        });
    }

    createDifficultyCard(x, y, name, description, color, difficulty) {
        // 创建卡片背景
        const cardBg = this.add.graphics();
        cardBg.fillStyle(color, 0.7);
        cardBg.fillRoundedRect(x - 120, y - 150, 240, 300, 20);

        // 创建难度名称
        this.add.text(x, y - 50, name, {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 创建难度描述
        this.add.text(x, y + 20, description, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff',
            align: 'center',
            lineSpacing: 8
        }).setOrigin(0.5);

        // 创建动物伙伴图标（根据设计文档）
        const animalIcon = this.add.circle(x, y + 100, 30, color);
        this.add.text(x, y + 100, difficulty === 'primary' ? '🌱' :
                      difficulty === 'medium' ? '🌳' : '🌲', {
            fontSize: '32px'
        }).setOrigin(0.5);

        return cardBg;
    }

    createSounds() {
        // 创建音效
        this.clickSound = this.sound.add('click');
    }

    createBackButton() {
        // 创建返回按钮
        const backBtn = this.add.text(60, 50, '← 返回', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            // 播放点击音效
            if (window.gameState.isSoundOn && this.clickSound) {
                this.clickSound.play();
            }
            // 返回角色选择场景
            this.scene.start('CharacterSelectScene');
        });

        // 悬停效果
        backBtn.on('pointerover', () => {
            backBtn.setColor('#ffff00');
        });

        backBtn.on('pointerout', () => {
            backBtn.setColor('#ffffff');
        });
    }

    selectDifficulty(difficulty) {
        // 播放点击音效
        if (window.gameState.isSoundOn) {
            this.clickSound.play();
        }

        // 设置选择的难度
        window.gameState.selectedDifficulty = difficulty;
        window.gameState.currentLevel = 1;
        window.gameState.currentChapter = 1;
        window.gameState.collectedParts = [];
        window.gameState.collectedStars = 0;
        window.gameState.unlockedWeapons = [];
        window.gameState.skillEnergy = 0;

        // 切换到关卡场景
        this.scene.start('LevelScene');
    }
}