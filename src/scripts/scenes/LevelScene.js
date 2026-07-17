// LevelScene - 关卡选择场景
export class LevelScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LevelScene' });
    }

    create() {
        // 创建背景
        this.createBackground();

        // 创建UI
        this.createUI();

        // 创建章节选择
        this.createChapterSelection();

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
            '奇迹森林大冒险',
            {
                fontFamily: 'Arial',
                fontSize: '48px',
                color: '#ffffff',
                fontStyle: 'bold'
            }
        ).setOrigin(0.5);
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
                this.scene.start('DifficultySelectScene');
            });

        this.add.text(50, 50, '返回', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5, 0.5);

        // 显示当前选择的角色和难度
        const character = window.gameState.selectedCharacter === 'qiqui' ? '奇奇' : '妙妙';
        const difficulty = window.gameState.selectedDifficulty === 'primary' ? '初级' :
                          window.gameState.selectedDifficulty === 'medium' ? '中级' : '高级';

        this.add.text(
            this.cameras.main.width - 50,
            50,
            `${character} | ${difficulty}`,
            {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#ffffff'
            }
        ).setOrigin(1, 0.5);

        // 显示收集的星星
        this.add.text(
            this.cameras.main.width - 50,
            100,
            `星星: ${window.gameState.collectedStars}`,
            {
                fontFamily: 'Arial',
                fontSize: '28px',
                color: '#ffff00'
            }
        ).setOrigin(1, 0.5);
    }

    createChapterSelection() {
        // 创建章节选择
        const chapters = [
            { id: 1, name: '字母花园', color: 0x98fb98, icon: '🌸' },
            { id: 2, name: '数字矿洞', color: 0xdda0dd, icon: '⛏️' },
            { id: 3, name: '汉字竹林', color: 0x90ee90, icon: '🎋' },
            { id: 4, name: '彩虹湖泊', color: 0x87ceeb, icon: '🌈' },
            { id: 5, name: '星空神殿', color: 0x6a5acd, icon: '✨' }
        ];

        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        // 创建章节卡片
        chapters.forEach((chapter, index) => {
            const isUnlocked = this.isChapterUnlocked(chapter.id);
            const card = this.createChapterCard(
                centerX - 300 + index * 150,
                centerY,
                chapter,
                isUnlocked
            );

            if (isUnlocked) {
                card.setInteractive().on('pointerdown', () => {
                    this.selectChapter(chapter.id);
                });
            }
        });
    }

    isChapterUnlocked(chapterId) {
        // 检查章节是否解锁
        if (chapterId === 1) return true; // 第一章总是解锁

        // 检查是否收集了上一章的零件
        return window.gameState.collectedParts.includes(chapterId - 1);
    }

    createChapterCard(x, y, chapter, isUnlocked) {
        // 创建卡片背景
        const cardBg = this.add.graphics();
        cardBg.fillStyle(isUnlocked ? chapter.color : 0x808080, 0.7);
        cardBg.fillRoundedRect(x - 60, y - 80, 120, 160, 15);

        // 创建章节图标
        this.add.text(x, y - 30, chapter.icon, {
            fontSize: '48px'
        }).setOrigin(0.5);

        // 创建章节名称
        this.add.text(x, y + 20, chapter.name, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // 创建章节状态
        if (isUnlocked) {
            const completedLevels = this.getCompletedLevels(chapter.id);
            this.add.text(x, y + 50, `完成: ${completedLevels}/5`, {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#ffff00'
            }).setOrigin(0.5);
        } else {
            this.add.text(x, y + 50, '未解锁', {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#ff0000'
            }).setOrigin(0.5);
        }

        return cardBg;
    }

    getCompletedLevels(chapterId) {
        // 获取已完成的关卡数量（简化实现）
        return 0;
    }

    selectChapter(chapterId) {
        if (window.gameState.isSoundOn) {
            this.clickSound.play();
        }

        // 设置当前章节
        window.gameState.currentChapter = chapterId;

        // 进入关卡选择
        this.scene.start('PuzzleScene', {
            levelData: { chapter: chapterId, level: 1 },
            chapter: chapterId
        });
    }

    createSounds() {
        // 创建音效
        this.clickSound = this.sound.add('click');
    }
}