// ResultScene - 结果场景
export class ResultScene extends Phaser.Scene {
    constructor() {
        super({ key: 'ResultScene' });
    }

    init(data) {
        // 接收关卡数据
        this.levelData = data.levelData;
        this.chapter = data.chapter;
        this.isWin = data.isWin;
    }

    create() {
        // 创建背景
        this.createBackground();

        // 显示结果
        if (this.isWin) {
            this.showWinResult();
        } else {
            this.showLoseResult();
        }

        // 创建音效
        this.createSounds();
    }

    createBackground() {
        // 创建背景
        this.add.image(0, 0, 'background').setOrigin(0, 0).setDisplaySize(
            this.cameras.main.width,
            this.cameras.main.height
        );

        // 显示标题
        this.add.text(
            this.cameras.main.width / 2,
            100,
            '关卡结果',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#ffffff',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);
    }

    showWinResult() {
        // 显示胜利结果
        this.add.text(
            this.cameras.main.width / 2,
            200,
            '恭喜你！',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#00ff00',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // 显示章节完成
        const chapterNames = {
            1: '字母花园',
            2: '数字矿洞',
            3: '汉字竹林',
            4: '彩虹湖泊',
            5: '星空神殿'
        };

        this.add.text(
            this.cameras.main.width / 2,
            300,
            `完成${chapterNames[this.chapter]}章节！`,
            {
                fontFamily: 'Arial',
                fontSize: '36px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        // 显示获得的奖励
        this.add.text(
            this.cameras.main.width / 2,
            400,
            `获得星星: ${window.gameState.collectedStars}`,
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffff00'
            }
        ).setOrigin(0.5);

        // 检查是否完成所有章节
        if (window.gameState.collectedParts.length === 5) {
            this.showGameCompletion();
        } else {
            // 显示继续按钮
            const continueButton = this.add.image(
                this.cameras.main.width / 2,
                550,
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
                this.scene.start('LevelScene');
            });
        }
    }

    showLoseResult() {
        // 显示失败结果
        this.add.text(
            this.cameras.main.width / 2,
            200,
            '再接再厉！',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#ff0000',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // 显示鼓励信息
        this.add.text(
            this.cameras.main.width / 2,
            300,
            '别灰心，再试一次吧！',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        // 显示重试按钮
        const retryButton = this.add.image(
            this.cameras.main.width / 2 - 150,
            500,
            'button'
        ).setScale(1.2).setInteractive();

        this.add.text(
            retryButton.x,
            retryButton.y,
            '重新挑战',
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
            this.scene.start('PuzzleScene', {
                levelData: this.levelData,
                chapter: this.chapter
            });
        });

        // 显示返回按钮
        const backButton = this.add.image(
            this.cameras.main.width / 2 + 150,
            500,
            'button'
        ).setScale(1.2).setInteractive();

        this.add.text(
            backButton.x,
            backButton.y,
            '返回主菜单',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        backButton.on('pointerdown', () => {
            if (window.gameState.isSoundOn) {
                this.clickSound.play();
            }
            this.scene.start('LevelScene');
        });
    }

    showGameCompletion() {
        // 显示游戏完成画面
        this.add.text(
            this.cameras.main.width / 2,
            450,
            '恭喜你完成了所有章节！',
            {
                fontFamily: 'Arial',
                fontSize: '42px',
                color: '#ffd700',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);

        // 显示结局动画提示
        this.add.text(
            this.cameras.main.width / 2,
            520,
            '森林苏醒，飞船修复，准备回家！',
            {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        // 显示重新开始按钮
        const restartButton = this.add.image(
            this.cameras.main.width / 2,
            650,
            'button'
        ).setScale(1.2).setInteractive();

        this.add.text(
            restartButton.x,
            restartButton.y,
            '重新开始',
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        restartButton.on('pointerdown', () => {
            if (window.gameState.isSoundOn) {
                this.clickSound.play();
            }
            // 重置游戏状态
            window.gameState = {
                selectedCharacter: window.gameState.selectedCharacter,
                selectedDifficulty: window.gameState.selectedDifficulty,
                currentLevel: 1,
                currentChapter: 1,
                collectedParts: [],
                collectedStars: 0,
                unlockedWeapons: [],
                skillEnergy: 0,
                isSoundOn: window.gameState.isSoundOn,
                isMusicOn: window.gameState.isMusicOn
            };
            this.scene.start('LevelScene');
        });
    }

    createSounds() {
        // 创建音效
        this.clickSound = this.sound.add('click');
    }
}