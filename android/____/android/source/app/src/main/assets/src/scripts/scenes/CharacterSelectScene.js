// CharacterSelectScene - 角色选择场景
export class CharacterSelectScene extends Phaser.Scene {
    constructor() {
        super({ key: 'CharacterSelectScene' });
    }

    create() {
        // 创建背景
        this.createBackground();

        // 创建标题
        this.createTitle();

        // 创建角色选择UI
        this.createCharacterSelection();

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
        this.add.text(this.cameras.main.width / 2, 100, '选择你的角色', {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    createTitle() {
        // 游戏标题
        this.add.image(
            this.cameras.main.width / 2,
            200,
            'logo'
        ).setOrigin(0.5).setScale(0.8);
    }

    createCharacterSelection() {
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2 + 100;

        // 创建角色卡片容器
        const qiquiCard = this.createCharacterCard(
            centerX - 200,
            centerY,
            'qiqui',
            '奇奇',
            '勇敢冲动，爱冒险\n专属技能：疾风冲刺',
            0xffa500 // 橙色
        );

        const miaomiaoCard = this.createCharacterCard(
            centerX + 200,
            centerY,
            'miaomiao',
            '妙妙',
            '聪明冷静，善于观察\n专属技能：能量护盾',
            0x9370db // 紫色
        );

        // 添加点击事件
        qiquiCard.setInteractive().on('pointerdown', () => {
            this.selectCharacter('qiqui');
        });

        miaomiaoCard.setInteractive().on('pointerdown', () => {
            this.selectCharacter('miaomiao');
        });
    }

    createCharacterCard(x, y, key, name, description, color) {
        // 创建卡片背景
        const cardBg = this.add.graphics();
        cardBg.fillStyle(color, 0.7);
        cardBg.fillRoundedRect(x - 150, y - 200, 300, 400, 20);

        // 创建角色图片
        const characterImage = this.add.image(x, y - 50, key)
            .setScale(0.8);

        // 创建角色名字
        this.add.text(x, y + 100, name, {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 创建角色描述
        this.add.text(x, y + 160, description, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5);

        // 创建选择提示
        this.add.text(x, y + 250, '点击选择', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffff00'
        }).setOrigin(0.5);

        return cardBg;
    }

    createSounds() {
        // 创建音效
        this.clickSound = this.sound.add('click');
    }

    selectCharacter(character) {
        // 播放点击音效
        if (window.gameState.isSoundOn) {
            this.clickSound.play();
        }

        // 设置选择的角色
        window.gameState.selectedCharacter = character;

        // 切换到难度选择场景
        this.scene.start('DifficultySelectScene');
    }
}