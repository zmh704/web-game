// BattleScene - 战斗场景
export class BattleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BattleScene' });
    }

    init(data) {
        // 接收关卡数据
        this.levelData = data.levelData;
        this.chapter = data.chapter;
        this.correctCount = data.correctCount;
    }

    create() {
        // 创建背景
        this.createBackground();

        // 创建UI
        this.createUI();

        // 初始化战斗系统
        this.initializeBattle();

        // 创建音效
        this.createSounds();
    }

    createBackground() {
        // 创建战斗场景背景
        this.bg = this.add.image(
            0, 0,
            'level_bg'
        ).setOrigin(0, 0).setDisplaySize(
            this.cameras.main.width,
            this.cameras.main.height
        );

        // 根据章节设置不同的背景颜色
        switch(this.chapter) {
            case 1: // 字母花园
                this.bg.setTint(0x98fb98);
                break;
            case 2: // 数字矿洞
                this.bg.setTint(0xdda0dd);
                break;
            case 3: // 汉字竹林
                this.bg.setTint(0x90ee90);
                break;
            case 4: // 彩虹湖泊
                this.bg.setTint(0x87ceeb);
                break;
            case 5: // 星空神殿
                this.bg.setTint(0x6a5acd);
                break;
        }
    }

    createUI() {
        // 创建返回按钮
        this.backButton = this.add.image(50, 50, 'button')
            .setScale(0.8)
            .setInteractive()
            .on('pointerdown', () => {
                if (window.gameState.isSoundOn) {
                    this.clickSound.play();
                }
                this.scene.start('LevelScene');
            });

        this.add.text(50, 50, '返回', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5, 0.5);

        // 创建星星计数
        this.starText = this.add.text(
            this.cameras.main.width - 50,
            50,
            `星星: ${window.gameState.collectedStars}`,
            {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffff00'
            }
        ).setOrigin(1, 0.5);

        // 创建怪物血条
        this.createMonsterHealthBar();

        // 创建武器选择
        this.createWeaponSelection();

        // 创建技能能量条
        this.createSkillBar();
    }

    createMonsterHealthBar() {
        // 创建怪物血条背景
        this.monsterHealthBg = this.add.graphics();
        this.monsterHealthBg.fillStyle(0x333333, 0.7);
        this.monsterHealthBg.fillRoundedRect(
            this.cameras.main.width / 2 - 150,
            100,
            300,
            30,
            15
        );

        // 创建怪物血条
        this.monsterHealthBar = this.add.graphics();
        this.updateMonsterHealthBar();

        // 创建怪物名称
        this.add.text(
            this.cameras.main.width / 2,
            70,
            '追风怪',
            {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);
    }

    updateMonsterHealthBar() {
        this.monsterHealthBar.clear();
        const healthWidth = 280 * (this.monsterHealth / this.maxMonsterHealth);

        this.monsterHealthBar.fillStyle(0xff0000, 0.9);
        this.monsterHealthBar.fillRoundedRect(
            this.cameras.main.width / 2 - 140,
            105,
            healthWidth,
            20,
            10
        );
    }

    createWeaponSelection() {
        // 创建武器选择UI
        this.weapons = [];

        // 检查已解锁的武器
        const unlockedWeapons = window.gameState.unlockedWeapons;
        const weaponTypes = ['chinese', 'math', 'english'];

        weaponTypes.forEach((weaponType, index) => {
            const isUnlocked = unlockedWeapons.includes(weaponType);
            this.createWeaponButton(150 + index * 150, 200, weaponType, isUnlocked);
        });
    }

    createWeaponButton(x, y, weaponType, isUnlocked) {
        // 创建武器按钮背景
        const buttonBg = this.add.graphics();
        buttonBg.fillStyle(isUnlocked ? 0x4169e1 : 0x808080, 0.8);
        buttonBg.fillRoundedRect(x - 50, y - 50, 100, 100, 15);

        // 创建武器图标
        let weaponIcon, weaponName;
        switch(weaponType) {
            case 'chinese':
                weaponIcon = '🖋️';
                weaponName = '毛笔光剑';
                break;
            case 'math':
                weaponIcon = '➗';
                weaponName = '几何能量珠';
                break;
            case 'english':
                weaponIcon = '🏹';
                weaponName = '字母连发弓';
                break;
        }

        this.add.text(x, y - 20, weaponIcon, {
            fontSize: '32px'
        }).setOrigin(0.5);

        this.add.text(x, y + 20, weaponName, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 90 }
        }).setOrigin(0.5);

        // 如果解锁，添加点击事件
        if (isUnlocked) {
            buttonBg.setInteractive().on('pointerdown', () => {
                this.selectWeapon(weaponType);
            });
        }

        this.weapons.push({
            type: weaponType,
            button: buttonBg,
            isUnlocked: isUnlocked
        });
    }

    createSkillBar() {
        // 技能能量条背景
        this.skillBarBg = this.add.graphics();
        this.skillBarBg.fillStyle(0x333333, 0.7);
        this.skillBarBg.fillRoundedRect(
            this.cameras.main.width - 220,
            50,
            200,
            30,
            15
        );

        // 技能能量条
        this.skillBar = this.add.graphics();
        this.updateSkillBar();

        // 技能按钮
        this.skillButton = this.add.image(
            this.cameras.main.width - 110,
            100,
            'button'
        ).setScale(0.8).setInteractive();

        const character = window.gameState.selectedCharacter;
        const skillText = character === 'qiqui' ? '疾风冲刺' : '能量护盾';

        this.add.text(
            this.cameras.main.width - 110,
            100,
            skillText,
            {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        // 技能按钮点击事件
        this.skillButton.on('pointerdown', () => {
            this.useSkill();
        });
    }

    updateSkillBar() {
        this.skillBar.clear();
        const energy = window.gameState.skillEnergy;
        const maxEnergy = 100;
        const width = 180 * (energy / maxEnergy);

        this.skillBar.fillStyle(0xffd700, 0.9);
        this.skillBar.fillRoundedRect(
            this.cameras.main.width - 210,
            55,
            width,
            20,
            10
        );
    }

    initializeBattle() {
        // 初始化战斗状态
        this.isBattleOver = false;
        this.selectedWeapon = null;
        this.monsterHealth = 100;
        this.maxMonsterHealth = 100;
        this.attackCooldown = false;

        // 创建主角
        this.createPlayer();

        // 创建怪物
        this.createMonster();

        // 显示战斗提示
        this.showBattleStart();
    }

    createPlayer() {
        // 创建主角
        const character = window.gameState.selectedCharacter;
        this.player = this.add.sprite(
            200,
            this.cameras.main.height - 200,
            character
        ).setScale(0.8);

        // 创建攻击按钮
        this.attackButton = this.add.image(
            this.cameras.main.width - 100,
            this.cameras.main.height - 100,
            'button'
        ).setScale(1.2).setInteractive().setAlpha(0.7);

        this.add.text(
            this.attackButton.x,
            this.attackButton.y,
            '攻击',
            {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        this.attackButton.on('pointerdown', () => {
            this.playerAttack();
        });
    }

    createMonster() {
        // 创建怪物
        this.monster = this.add.sprite(
            this.cameras.main.width - 200,
            this.cameras.main.height - 200,
            'monster'
        ).setScale(1.2);

        // 创建怪物攻击提示
        this.monsterAttackHint = this.add.graphics();
        this.monsterAttackHint.fillStyle(0xffff00, 0.5);
        this.monsterAttackHint.fillCircle(
            this.monster.x,
            this.monster.y - 100,
            30
        ).setVisible(false);
    }

    showBattleStart() {
        // 显示战斗开始提示
        this.battleStartText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            '选择武器迎战追风怪！',
            {
                fontFamily: 'Arial',
                fontSize: '36px',
                color: '#ffffff',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5).setAlpha(0);

        // 淡入动画
        this.tweens.add({
            targets: this.battleStartText,
            alpha: 1,
            duration: 500,
            onComplete: () => {
                // 延迟后开始战斗
                this.time.delayedCall(1500, () => {
                    this.tweens.add({
                        targets: this.battleStartText,
                        alpha: 0,
                        duration: 500
                    });
                });
            }
        });
    }

    selectWeapon(weaponType) {
        if (this.isBattleOver) return;

        // 设置选择的武器
        this.selectedWeapon = weaponType;

        // 高亮选中的武器
        this.weapons.forEach(weapon => {
            if (weapon.type === weaponType) {
                weapon.button.clear();
                weapon.button.fillStyle(0xffd700, 0.9);
                weapon.button.fillRoundedRect(
                    weapon.button.x - 50,
                    weapon.button.y - 50,
                    100,
                    100,
                    15
                );
            } else if (weapon.isUnlocked) {
                weapon.button.clear();
                weapon.button.fillStyle(0x4169e1, 0.8);
                weapon.button.fillRoundedRect(
                    weapon.button.x - 50,
                    weapon.button.y - 50,
                    100,
                    100,
                    15
                );
            }
        });

        // 播放选择音效
        if (window.gameState.isSoundOn) {
            this.clickSound.play();
        }
    }

    playerAttack() {
        if (this.isBattleOver || !this.selectedWeapon || this.attackCooldown) return;

        // 设置攻击冷却
        this.attackCooldown = true;
        this.time.delayedCall(1000, () => {
            this.attackCooldown = false;
        });

        // 根据武器类型发动不同攻击
        this.performAttack(this.selectedWeapon);

        // 播放攻击音效
        if (window.gameState.isSoundOn) {
            this.attackSound.play();
        }
    }

    performAttack(weaponType) {
        // 创建攻击动画
        let attackEffect;
        switch(weaponType) {
            case 'chinese':
                attackEffect = this.add.text(
                    this.player.x + 100,
                    this.player.y - 50,
                    '汉字光波！',
                    {
                        fontFamily: 'Arial',
                        fontSize: '32px',
                        color: '#ffd700',
                        fontStyle: 'bold'
                    }
                );
                break;
            case 'math':
                attackEffect = this.add.graphics();
                attackEffect.fillStyle(0x00ffff, 0.8);
                attackEffect.fillCircle(
                    this.player.x + 100,
                    this.player.y - 50,
                    20
                );
                break;
            case 'english':
                attackEffect = this.add.text(
                    this.player.x + 100,
                    this.player.y - 50,
                    'A B C！',
                    {
                        fontFamily: 'Arial',
                        fontSize: '32px',
                        color: '#ffffff',
                        fontStyle: 'bold'
                    }
                );
                break;
        }

        // 攻击动画
        this.tweens.add({
            targets: attackEffect,
            x: this.monster.x - 50,
            duration: 500,
            onComplete: () => {
                attackEffect.destroy();
                this.monsterHit();
            }
        });
    }

    monsterHit() {
        // 减少怪物血量
        this.monsterHealth -= 20;
        this.updateMonsterHealthBar();

        // 显示命中效果
        this.monster.setTint(0xff0000);
        this.time.delayedCall(200, () => {
            this.monster.clearTint();
        });

        // 检查怪物是否被击败
        if (this.monsterHealth <= 0) {
            this.battleWin();
        } else {
            // 怪物反击
            this.time.delayedCall(1000, () => {
                this.monsterAttack();
            });
        }
    }

    monsterAttack() {
        if (this.isBattleOver) return;

        // 显示攻击提示
        this.monsterAttackHint.setVisible(true);

        // 隐藏提示
        this.time.delayedCall(500, () => {
            this.monsterAttackHint.setVisible(false);

            // 使用妙妙的护盾技能
            if (window.gameState.selectedCharacter === 'miaomiao' &&
                window.gameState.skillEnergy >= 100) {
                this.useMiaomiaoSkill();
                return;
            }

            // 显示怪物攻击动画
            this.monster.setTint(0xffff00);
            this.tweens.add({
                targets: this.monster,
                x: this.monster.x - 50,
                duration: 200,
                yoyo: true,
                onComplete: () => {
                    this.monster.clearTint();
                    this.playerHit();
                }
            });
        });
    }

    playerHit() {
        // 显示玩家被击中效果
        this.player.setTint(0xff0000);
        this.time.delayedCall(200, () => {
            this.player.clearTint();
        });

        // 减少星星
        window.gameState.collectedStars = Math.max(
            window.gameState.collectedStars - 3,
            0
        );
        this.starText.setText(`星星: ${window.gameState.collectedStars}`);

        // 播放命中音效
        if (window.gameState.isSoundOn) {
            this.hitSound.play();
        }
    }

    useSkill() {
        if (window.gameState.skillEnergy < 100 || this.isBattleOver) return;

        // 使用技能
        window.gameState.skillEnergy = 0;
        this.updateSkillBar();

        // 根据角色使用不同技能
        const character = window.gameState.selectedCharacter;
        if (character === 'qiqui') {
            this.useQiquiSkill();
        } else {
            this.useMiaomiaoSkill();
        }
    }

    useQiquiSkill() {
        // 奇奇的疾风冲刺技能 - 连续攻击
        this.performAttack(this.selectedWeapon);
        this.time.delayedCall(200, () => {
            this.performAttack(this.selectedWeapon);
        });
        this.time.delayedCall(400, () => {
            this.performAttack(this.selectedWeapon);
        });

        // 显示技能效果
        this.add.text(
            this.player.x,
            this.player.y - 100,
            '疾风连击！',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffa500',
                fontStyle: 'bold'
            }
        );
    }

    useMiaomiaoSkill() {
        // 妙妙的能量护盾技能 - 格挡攻击
        this.player.setTint(0x00ffff);

        // 显示技能效果
        this.add.text(
            this.player.x,
            this.player.y - 100,
            '能量护盾！',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#9370db',
                fontStyle: 'bold'
            }
        );

        // 恢复正常颜色
        this.time.delayedCall(2000, () => {
            this.player.clearTint();
        });
    }

    battleWin() {
        this.isBattleOver = true;

        // 停止怪物反击
        this.time.removeAllEvents();

        // 显示胜利效果
        this.monster.setTint(0x808080);

        // 获得飞船零件
        if (!window.gameState.collectedParts.includes(this.chapter)) {
            window.gameState.collectedParts.push(this.chapter);
        }

        // 增加星星
        window.gameState.collectedStars += 30;
        this.starText.setText(`星星: ${window.gameState.collectedStars}`);

        // 显示胜利画面
        this.time.delayedCall(1000, () => {
            this.showBattleWin();
        });
    }

    showBattleWin() {
        // 显示胜利文本
        this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 100,
            '战斗胜利！',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#00ff00',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // 显示获得的零件
        this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 30,
            `获得飞船零件：${this.chapter}`,
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffff00'
            }
        ).setOrigin(0.5);

        // 显示获得的星星
        this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 30,
            '获得星星：30',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffff00'
            }
        ).setOrigin(0.5);

        // 显示继续按钮
        const continueButton = this.add.image(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 150,
            'button'
        ).setScale(1.2).setInteractive();

        this.add.text(
            continueButton.x,
            continueButton.y,
            '继续冒险',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        continueButton.on('pointerdown', () => {
            if (window.gameState.isSoundOn) {
                this.clickSound.play();
            }
            this.scene.start('ResultScene', {
                levelData: this.levelData,
                chapter: this.chapter,
                isWin: true
            });
        });
    }

    createSounds() {
        // 创建音效
        this.clickSound = this.sound.add('click');
        this.attackSound = this.sound.add('attack');
        this.hitSound = this.sound.add('hit');
    }
}