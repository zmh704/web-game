// ChaseScene - 追逐逃生场景
export class ChaseScene extends Phaser.Scene {
    constructor() {
        super({ key: 'ChaseScene' });
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

        // 初始化游戏元素
        this.initializeGame();

        // 创建音效
        this.createSounds();

        // 显示怪物苏醒动画
        this.showMonsterAwake();
    }

    createBackground() {
        // 创建追逐场景背景
        this.bg = this.add.tileSprite(
            0, 0,
            this.cameras.main.width,
            this.cameras.main.height,
            'level_bg'
        ).setOrigin(0, 0);

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

        // 创建倒计时
        this.timeText = this.add.text(
            this.cameras.main.width / 2,
            50,
            '15',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#ff0000',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // 创建技能能量条
        this.createSkillBar();
    }

    createSkillBar() {
        // 技能能量条背景
        this.skillBarBg = this.add.graphics();
        this.skillBarBg.fillStyle(0x333333, 0.7);
        this.skillBarBg.fillRoundedRect(
            this.cameras.main.width - 220,
            100,
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
            150,
            'button'
        ).setScale(0.8).setInteractive();

        const character = window.gameState.selectedCharacter;
        const skillText = character === 'qiqui' ? '疾风冲刺' : '能量护盾';

        this.add.text(
            this.cameras.main.width - 110,
            150,
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
            105,
            width,
            20,
            10
        );
    }

    initializeGame() {
        // 初始化游戏状态
        this.isGameOver = false;
        this.isGameStarted = false;
        this.collectedParts = 0;
        this.dodgedObstacles = 0;
        this.monsterSpeed = 2 + (this.correctCount * 0.5); // 基于答对题目数增加难度

        // 根据难度调整速度
        const difficulty = window.gameState.selectedDifficulty;
        if (difficulty === 'medium') {
            this.monsterSpeed *= 1.2;
        } else if (difficulty === 'advanced') {
            this.monsterSpeed *= 1.5;
        }

        // 创建主角
        this.createPlayer();

        // 创建怪物
        this.createMonster();

        // 创建障碍物组
        this.obstacles = this.physics.add.group();

        // 创建零件组
        this.parts = this.physics.add.group();

        // 设置碰撞检测
        this.setupCollisions();

        // 初始化计时器
        this.timeLeft = 15;
        this.timer = this.time.addEvent({
            delay: 1000,
            callback: this.updateTimer,
            callbackScope: this,
            loop: true
        });
    }

    createPlayer() {
        // 创建主角
        const character = window.gameState.selectedCharacter;
        this.player = this.physics.add.sprite(
            100,
            this.cameras.main.height / 2,
            character
        ).setScale(0.5);

        // 设置主角物理属性
        this.player.setCollideWorldBounds(true);
        this.player.setBounce(0.2);
        this.player.setSize(80, 120);

        // 创建控制按钮
        this.createControls();
    }

    createControls() {
        // 跳跃按钮
        this.jumpButton = this.add.image(
            this.cameras.main.width - 100,
            this.cameras.main.height - 100,
            'button'
        ).setScale(1.2).setInteractive().setAlpha(0.7);

        this.add.text(
            this.jumpButton.x,
            this.jumpButton.y,
            '跳跃',
            {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        this.jumpButton.on('pointerdown', () => {
            this.playerJump();
        });

        // 下滑按钮
        this.slideButton = this.add.image(
            this.cameras.main.width - 200,
            this.cameras.main.height - 100,
            'button'
        ).setScale(1.2).setInteractive().setAlpha(0.7);

        this.add.text(
            this.slideButton.x,
            this.slideButton.y,
            '下滑',
            {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        this.slideButton.on('pointerdown', () => {
            this.playerSlide();
        });
    }

    createMonster() {
        // 创建追风怪
        this.monster = this.physics.add.sprite(
            -100,
            this.cameras.main.height / 2,
            'monster'
        ).setScale(0.8);

        // 设置怪物物理属性
        this.monster.setCollideWorldBounds(true);
        this.monster.setBounce(0.2);
        this.monster.setSize(100, 100);
        this.monster.setVelocityX(this.monsterSpeed);
    }

    setupCollisions() {
        // 主角与障碍物碰撞
        this.physics.add.collider(
            this.player,
            this.obstacles,
            this.hitObstacle,
            null,
            this
        );

        // 主角与零件碰撞
        this.physics.add.overlap(
            this.player,
            this.parts,
            this.collectPart,
            null,
            this
        );

        // 主角与怪物碰撞
        this.physics.add.collider(
            this.player,
            this.monster,
            this.hitMonster,
            null,
            this
        );
    }

    showMonsterAwake() {
        // 显示怪物苏醒动画
        this.cameras.main.flash(500, 0, 0, 0);

        // 显示提示
        this.awakeText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            '追风怪醒了！',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#ff0000',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5).setAlpha(0);

        // 淡入动画
        this.tweens.add({
            targets: this.awakeText,
            alpha: 1,
            duration: 500,
            onComplete: () => {
                // 延迟后开始游戏
                this.time.delayedCall(1000, () => {
                    this.tweens.add({
                        targets: this.awakeText,
                        alpha: 0,
                        duration: 500,
                        onComplete: () => {
                            this.startGame();
                        }
                    });
                });
            }
        });

        // 播放怪物音效
        if (window.gameState.isSoundOn) {
            this.monsterSound.play();
        }
    }

    startGame() {
        this.isGameStarted = true;

        // 开始生成障碍物和零件
        this.obstacleTimer = this.time.addEvent({
            delay: Phaser.Math.Between(1500, 3000),
            callback: this.spawnObstacle,
            callbackScope: this,
            loop: true
        });

        this.partTimer = this.time.addEvent({
            delay: Phaser.Math.Between(2000, 4000),
            callback: this.spawnPart,
            callbackScope: this,
            loop: true
        });

        // 播放背景音乐
        if (window.gameState.isMusicOn) {
            this.bgm.play();
        }
    }

    spawnObstacle() {
        if (!this.isGameStarted) return;

        // 创建障碍物
        const obstacleType = Phaser.Math.Between(1, 3);
        let obstacle;

        switch(obstacleType) {
            case 1: // 石头
                obstacle = this.obstacles.create(
                    this.cameras.main.width,
                    Phaser.Math.Between(200, this.cameras.main.height - 100),
                    'rock'
                ).setScale(0.5);
                break;
            case 2: // 藤蔓
                obstacle = this.obstacles.create(
                    this.cameras.main.width,
                    100,
                    'vine'
                ).setScale(0.8);
                obstacle.setSize(50, this.cameras.main.height - 200);
                break;
            case 3: // 水坑
                obstacle = this.obstacles.create(
                    this.cameras.main.width,
                    this.cameras.main.height - 50,
                    'puddle'
                ).setScale(1.2);
                obstacle.setSize(80, 30);
                break;
        }

        // 设置障碍物属性
        obstacle.setVelocityX(-300);
        obstacle.setCollideWorldBounds(false);
        obstacle.body.allowGravity = false;
    }

    spawnPart() {
        if (!this.isGameStarted) return;

        // 创建零件
        const part = this.parts.create(
            this.cameras.main.width,
            Phaser.Math.Between(200, this.cameras.main.height - 100),
            'part'
        ).setScale(0.5);

        // 设置零件属性
        part.setVelocityX(-200);
        part.setCollideWorldBounds(false);
        part.body.allowGravity = false;
    }

    playerJump() {
        if (!this.isGameStarted || this.isGameOver) return;

        // 主角跳跃
        if (this.player.body.touching.down) {
            this.player.setVelocityY(-400);

            // 播放跳跃音效
            if (window.gameState.isSoundOn) {
                this.jumpSound.play();
            }
        }
    }

    playerSlide() {
        if (!this.isGameStarted || this.isGameOver) return;

        // 主角下滑
        this.player.setSize(80, 60);
        this.player.setOffset(0, 60);

        // 恢复正常大小
        this.time.delayedCall(500, () => {
            this.player.setSize(80, 120);
            this.player.setOffset(0, 0);
        });

        // 播放下滑音效
        if (window.gameState.isSoundOn) {
            this.slideSound.play();
        }
    }

    hitObstacle(player, obstacle) {
        if (this.isGameOver) return;

        // 处理碰撞
        obstacle.destroy();

        // 使用妙妙的护盾技能
        if (window.gameState.selectedCharacter === 'miaomiao' &&
            window.gameState.skillEnergy >= 100) {
            this.useMiaomiaoSkill();
            return;
        }

        // 减少星星
        window.gameState.collectedStars = Math.max(
            window.gameState.collectedStars - 5,
            0
        );
        this.starText.setText(`星星: ${window.gameState.collectedStars}`);

        // 显示碰撞效果
        this.showHitEffect();

        // 播放碰撞音效
        if (window.gameState.isSoundOn) {
            this.hitSound.play();
        }
    }

    collectPart(player, part) {
        // 收集零件
        part.destroy();
        this.collectedParts++;

        // 增加星星
        window.gameState.collectedStars += 5;
        this.starText.setText(`星星: ${window.gameState.collectedStars}`);

        // 显示收集效果
        this.showCollectEffect();

        // 播放收集音效
        if (window.gameState.isSoundOn) {
            this.collectSound.play();
        }
    }

    hitMonster(player, monster) {
        if (this.isGameOver) return;

        // 游戏结束
        this.gameOver();
    }

    showHitEffect() {
        // 显示碰撞效果
        const effect = this.add.graphics();
        effect.fillStyle(0xff0000, 0.5);
        effect.fillCircle(
            this.player.x,
            this.player.y,
            50
        );

        // 动画
        this.tweens.add({
            targets: effect,
            alpha: 0,
            scale: 2,
            duration: 500,
            onComplete: () => {
                effect.destroy();
            }
        });
    }

    showCollectEffect() {
        // 显示收集效果
        const effect = this.add.graphics();
        effect.fillStyle(0xffff00, 0.8);
        effect.fillCircle(
            this.player.x,
            this.player.y,
            30
        );

        // 动画
        this.tweens.add({
            targets: effect,
            alpha: 0,
            scale: 1.5,
            duration: 500,
            onComplete: () => {
                effect.destroy();
            }
        });
    }

    updateTimer() {
        if (!this.isGameStarted || this.isGameOver) return;

        this.timeLeft--;
        this.timeText.setText(this.timeLeft);

        // 增加怪物速度
        this.monsterSpeed += 0.2;
        this.monster.setVelocityX(this.monsterSpeed);

        // 增加心跳音效频率
        if (this.timeLeft <= 5 && window.gameState.isSoundOn) {
            this.heartbeatSound.play();
        }

        if (this.timeLeft <= 0) {
            // 时间到，游戏胜利
            this.gameWin();
        }
    }

    useSkill() {
        if (window.gameState.skillEnergy < 100) return;

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
        // 奇奇的疾风冲刺技能 - 短暂加速
        this.player.setVelocityX(300);

        // 显示技能效果
        const effect = this.add.text(
            this.player.x,
            this.player.y - 50,
            '疾风冲刺！',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffa500',
                fontStyle: 'bold'
            }
        );

        // 恢复正常速度
        this.time.delayedCall(2000, () => {
            this.player.setVelocityX(0);
            effect.destroy();
        });
    }

    useMiaomiaoSkill() {
        // 妙妙的能量护盾技能 - 免除一次碰撞
        this.player.setTint(0x00ffff);

        // 恢复正常颜色
        this.time.delayedCall(3000, () => {
            this.player.clearTint();
        });
    }

    gameOver() {
        this.isGameOver = true;
        this.isGameStarted = false;

        // 停止所有计时器
        this.timer.remove();
        this.obstacleTimer.remove();
        this.partTimer.remove();

        // 停止音乐
        if (this.bgm.isPlaying) {
            this.bgm.stop();
        }

        // 显示游戏结束画面
        this.showGameOver();
    }

    gameWin() {
        this.isGameOver = true;
        this.isGameStarted = false;

        // 停止所有计时器
        this.timer.remove();
        this.obstacleTimer.remove();
        this.partTimer.remove();

        // 停止音乐
        if (this.bgm.isPlaying) {
            this.bgm.stop();
        }

        // 获得飞船零件
        if (!window.gameState.collectedParts.includes(this.chapter)) {
            window.gameState.collectedParts.push(this.chapter);
        }

        // 显示胜利画面
        this.showGameWin();
    }

    showGameOver() {
        // 显示游戏结束文本
        this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 100,
            '被追风怪抓到了！',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#ff0000',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // 显示怪物挠痒痒动画
        this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 30,
            '不过别担心，它只是挠痒痒！',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        // 显示重试按钮
        const retryButton = this.add.image(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 100,
            'button'
        ).setScale(1.2).setInteractive();

        this.add.text(
            retryButton.x,
            retryButton.y,
            '再试一次',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        retryButton.on('pointerdown', () => {
            if (window.gameState.isSoundOn) {
                this.clickSound.play();
            }
            this.scene.restart();
        });

        // 显示继续按钮
        const continueButton = this.add.image(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 200,
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
            this.scene.start('BattleScene', {
                levelData: this.levelData,
                chapter: this.chapter,
                correctCount: this.correctCount
            });
        });
    }

    showGameWin() {
        // 显示胜利文本
        this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 100,
            '成功逃脱！',
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
            `获得星星：${this.collectedParts * 5 + 20}`,
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
        this.jumpSound = this.sound.add('jump');
        this.slideSound = this.sound.add('slide');
        this.collectSound = this.sound.add('collect');
        this.hitSound = this.sound.add('hit');
        this.monsterSound = this.sound.add('monster_roar');
        this.heartbeatSound = this.sound.add('heartbeat');

        // 创建背景音乐
        this.bgm = this.sound.add('chase_bgm');
        this.bgm.setLoop(true);
    }

    update() {
        if (!this.isGameStarted || this.isGameOver) return;

        // 更新背景滚动
        this.bg.tilePositionX += 5;

        // 更新主角位置
        if (this.player.y > this.cameras.main.height) {
            this.player.setY(this.cameras.main.height);
            this.player.setVelocityY(0);
        }
    }
}