// PuzzleScene - 解谜场景
export class PuzzleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PuzzleScene' });
    }

    init(data) {
        // 接收关卡数据
        this.levelData = data.levelData;
        this.puzzleType = data.puzzleType;
        this.chapter = data.chapter;
    }

    create() {
        // 创建背景
        this.createBackground();

        // 创建UI元素
        this.createUI();

        // 加载题目
        this.loadQuestion();

        // 创建音效
        this.createSounds();

        // 初始化游戏状态
        this.isAnswered = false;
        this.currentQuestionIndex = 0;
        this.correctCount = 0;
    }

    createBackground() {
        // 创建关卡背景
        this.add.image(0, 0, 'puzzle_bg').setOrigin(0, 0).setDisplaySize(
            this.cameras.main.width,
            this.cameras.main.height
        );

        // 根据章节显示不同的场景装饰
        this.addChapterDecoration();
    }

    addChapterDecoration() {
        const chapter = this.chapter || 1;
        let decoration;

        switch(chapter) {
            case 1: // 字母花园
                decoration = this.add.graphics();
                decoration.fillStyle(0x98fb98, 0.3);
                decoration.fillCircle(100, 100, 50);
                decoration.fillCircle(600, 200, 30);
                break;
            case 2: // 数字矿洞
                decoration = this.add.graphics();
                decoration.fillStyle(0xdda0dd, 0.4);
                decoration.fillTriangle(50, 300, 150, 200, 250, 300);
                decoration.fillTriangle(400, 250, 500, 150, 600, 250);
                break;
            case 3: // 汉字竹林
                decoration = this.add.graphics();
                decoration.fillStyle(0x90ee90, 0.3);
                for (let i = 0; i < 5; i++) {
                    decoration.fillRect(50 + i * 120, 100, 20, 200);
                }
                break;
            case 4: // 彩虹湖泊
                decoration = this.add.graphics();
                decoration.fillStyle(0x87ceeb, 0.3);
                decoration.fillEllipse(200, 400, 300, 100);
                break;
            case 5: // 星空神殿
                decoration = this.add.graphics();
                decoration.fillStyle(0x6a5acd, 0.3);
                for (let i = 0; i < 20; i++) {
                    decoration.fillCircle(
                        Phaser.Math.Between(50, 650),
                        Phaser.Math.Between(50, 400),
                        Phaser.Math.Between(2, 5)
                    );
                }
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

        // 创建题目容器
        this.questionContainer = this.add.container(
            this.cameras.main.width / 2,
            200
        );

        // 创建选项容器
        this.optionsContainer = this.add.container(
            this.cameras.main.width / 2,
            500
        );

        // 创建反馈容器
        this.feedbackContainer = this.add.container(
            this.cameras.main.width / 2,
            800
        );

        // 创建技能能量条
        this.createSkillBar();
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

    loadQuestion() {
        // 清空之前的题目
        this.questionContainer.removeAll(true);
        this.optionsContainer.removeAll(true);
        this.feedbackContainer.removeAll(true);

        // 获取当前题目
        const difficulty = window.gameState.selectedDifficulty;
        const subject = this.getSubjectForChapter();
        const questions = this.cache.json.get('questions')[difficulty][subject];
        this.currentQuestion = questions[this.currentQuestionIndex];

        // 显示题目
        this.showQuestion(this.currentQuestion);
    }

    getSubjectForChapter() {
        const chapter = this.chapter || 1;
        switch(chapter) {
            case 1: return 'english';
            case 2: return 'math';
            case 3: return 'chinese';
            case 4: return this.currentQuestionIndex % 2 === 0 ? 'chinese' : 'math';
            case 5: return this.currentQuestionIndex % 3 === 0 ? 'chinese' :
                          this.currentQuestionIndex % 3 === 1 ? 'math' : 'english';
            default: return 'chinese';
        }
    }

    showQuestion(question) {
        // 显示题目文本
        const questionText = this.add.text(0, 0, question.question, {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 600 }
        }).setOrigin(0.5);
        this.questionContainer.add(questionText);

        // 根据题目类型显示不同的内容
        switch(question.type) {
            case 'image_to_word':
                this.showImageToWordQuestion(question);
                break;
            case 'pinyin':
                this.showPinyinQuestion(question);
                break;
            case 'counting':
                this.showCountingQuestion(question);
                break;
            case 'addition':
                this.showMathQuestion(question);
                break;
            case 'letter_recognition':
                this.showLetterRecognitionQuestion(question);
                break;
            case 'word_to_image':
                this.showWordToImageQuestion(question);
                break;
            case 'character_composition':
                this.showCharacterCompositionQuestion(question);
                break;
            case 'reading_comprehension':
                this.showReadingComprehensionQuestion(question);
                break;
            case 'shape_recognition':
                this.showShapeRecognitionQuestion(question);
                break;
            case 'word_matching':
                this.showWordMatchingQuestion(question);
                break;
            case 'sentence_completion':
                this.showSentenceCompletionQuestion(question);
                break;
            case 'word_analysis':
                this.showWordAnalysisQuestion(question);
                break;
            case 'multiplication':
                this.showMathQuestion(question);
                break;
            case 'area_calculation':
                this.showMathQuestion(question);
                break;
            case 'tense':
                this.showTenseQuestion(question);
                break;
            case 'dialogue_understanding':
                this.showDialogueUnderstandingQuestion(question);
                break;
            default:
                this.showDefaultQuestion(question);
        }
    }

    showImageToWordQuestion(question) {
        // 显示图片（实际游戏中应该加载真实图片）
        const image = this.add.text(0, 80, `[${question.image}图片]`, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffff00'
        }).setOrigin(0.5);
        this.questionContainer.add(image);

        // 显示选项
        this.showOptions(question.options);
    }

    showPinyinQuestion(question) {
        // 显示汉字
        const word = this.add.text(0, 80, question.word, {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(word);

        // 显示选项
        this.showOptions(question.options);
    }

    showCountingQuestion(question) {
        // 显示图片描述
        const imageDesc = this.add.text(0, 80, `[${question.image}图片]`, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffff00'
        }).setOrigin(0.5);
        this.questionContainer.add(imageDesc);

        // 显示选项
        this.showOptions(question.options);
    }

    showMathQuestion(question) {
        // 显示数学题目
        const mathText = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(mathText);

        // 显示选项
        this.showOptions(question.options);
    }

    showLetterRecognitionQuestion(question) {
        // 显示题目描述
        const desc = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(desc);

        // 显示选项
        this.showOptions(question.options);
    }

    showWordToImageQuestion(question) {
        // 显示单词
        const word = this.add.text(0, 80, question.word, {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(word);

        // 显示选项（实际游戏中应该是图片）
        this.showOptions(question.options);
    }

    showCharacterCompositionQuestion(question) {
        // 显示部首组合
        const composition = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(composition);

        // 显示选项
        this.showOptions(question.options);
    }

    showReadingComprehensionQuestion(question) {
        // 显示短文
        const passage = this.add.text(0, -50, question.question, {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 600 }
        }).setOrigin(0.5);
        this.questionContainer.add(passage);

        // 显示问题
        const questionText = this.add.text(0, 100, '问题：' + question.question.split('(')[1].split(')')[0], {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffff00'
        }).setOrigin(0.5);
        this.questionContainer.add(questionText);

        // 显示选项
        this.showOptions(question.options);
    }

    showShapeRecognitionQuestion(question) {
        // 显示题目
        const questionText = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(questionText);

        // 显示选项（实际应该是图形）
        this.showOptions(question.options);
    }

    showWordMatchingQuestion(question) {
        // 显示句子
        const sentence = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(sentence);

        // 显示选项
        this.showOptions(question.options);
    }

    showSentenceCompletionQuestion(question) {
        // 显示不完整的句子
        const sentence = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(sentence);

        // 显示选项
        this.showOptions(question.options);
    }

    showWordAnalysisQuestion(question) {
        // 显示题目
        const questionText = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(questionText);

        // 显示选项
        this.showOptions(question.options);
    }

    showTenseQuestion(question) {
        // 显示不完整的句子
        const sentence = this.add.text(0, 80, question.question, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.questionContainer.add(sentence);

        // 显示选项
        this.showOptions(question.options);
    }

    showDialogueUnderstandingQuestion(question) {
        // 显示对话
        const dialogue = this.add.text(0, -30, question.question, {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 600 }
        }).setOrigin(0.5);
        this.questionContainer.add(dialogue);

        // 显示选项
        this.showOptions(question.options);
    }

    showDefaultQuestion(question) {
        // 默认显示选项
        this.showOptions(question.options);
    }

    showOptions(options) {
        // 清空之前的选项
        this.optionsContainer.removeAll(true);

        // 创建选项按钮
        const buttonWidth = 200;
        const buttonHeight = 80;
        const startX = -buttonWidth * (options.length - 1) / 2;

        options.forEach((option, index) => {
            const button = this.add.graphics();
            button.fillStyle(0x4169e1, 0.8);
            button.fillRoundedRect(
                startX + index * buttonWidth,
                0,
                buttonWidth - 20,
                buttonHeight,
                20
            );

            const optionText = this.add.text(
                startX + index * buttonWidth + buttonWidth / 2 - 10,
                buttonHeight / 2,
                option,
                {
                    fontFamily: 'Arial',
                    fontSize: '32px',
                    color: '#ffffff'
                }
            ).setOrigin(0.5);

            // 添加点击事件
            button.setInteractive(
                new Phaser.Geom.Rectangle(
                    startX + index * buttonWidth,
                    0,
                    buttonWidth - 20,
                    buttonHeight
                ),
                Phaser.Geom.Rectangle.Contains
            ).on('pointerdown', () => {
                this.checkAnswer(option);
            });

            this.optionsContainer.add([button, optionText]);
        });
    }

    checkAnswer(selectedOption) {
        if (this.isAnswered) return;

        this.isAnswered = true;

        const isCorrect = selectedOption === this.currentQuestion.correctAnswer;

        // 显示反馈
        this.showFeedback(isCorrect);

        // 播放音效
        if (window.gameState.isSoundOn) {
            if (isCorrect) {
                this.correctSound.play();
            } else {
                this.wrongSound.play();
            }
        }

        // 更新游戏状态
        if (isCorrect) {
            this.correctCount++;
            window.gameState.collectedStars += 10;
            window.gameState.skillEnergy = Math.min(
                window.gameState.skillEnergy + 20,
                100
            );

            // 解锁武器
            if (this.correctCount % 3 === 0) {
                const subject = this.getSubjectForChapter();
                if (!window.gameState.unlockedWeapons.includes(subject)) {
                    window.gameState.unlockedWeapons.push(subject);
                }
            }
        }

        // 更新技能能量条
        this.updateSkillBar();

        // 延迟切换到下一题或关卡
        this.time.delayedCall(2000, () => {
            this.nextQuestion();
        });
    }

    showFeedback(isCorrect) {
        // 清空之前的反馈
        this.feedbackContainer.removeAll(true);

        // 显示反馈
        const feedbackText = isCorrect ? '答对了！' : '再想想哦～';
        const feedbackColor = isCorrect ? 0x00ff00 : 0xff0000;

        const feedback = this.add.text(0, 0, feedbackText, {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: isCorrect ? '#00ff00' : '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.feedbackContainer.add(feedback);

        // 如果答对，显示奖励动画
        if (isCorrect) {
            this.showRewardAnimation();
        } else {
            // 显示提示
            this.showHint();
        }
    }

    showRewardAnimation() {
        // 创建星星爆炸效果
        for (let i = 0; i < 20; i++) {
            const star = this.add.graphics();
            star.fillStyle(0xffff00, 1);
            star.fillCircle(0, 0, 5);

            // 随机位置和速度
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const velocity = Phaser.Math.FloatBetween(2, 5);

            star.x = Math.cos(angle) * 50;
            star.y = Math.sin(angle) * 50;

            this.feedbackContainer.add(star);

            // 动画
            this.tweens.add({
                targets: star,
                x: star.x * 10,
                y: star.y * 10,
                alpha: 0,
                duration: 1000,
                ease: 'Power2'
            });
        }

        // 显示获得的星星数量
        const starText = this.add.text(0, 60, '+10 星星', {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffff00'
        }).setOrigin(0.5);
        this.feedbackContainer.add(starText);
    }

    showHint() {
        // 显示提示
        const hintText = this.add.text(0, 60, this.currentQuestion.hint, {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 500 }
        }).setOrigin(0.5);
        this.feedbackContainer.add(hintText);
    }

    nextQuestion() {
        // 获取当前难度和学科的所有题目
        const difficulty = window.gameState.selectedDifficulty;
        const subject = this.getSubjectForChapter();
        const questions = this.cache.json.get('questions')[difficulty][subject];

        // 检查是否还有下一题
        if (this.currentQuestionIndex < questions.length - 1) {
            this.currentQuestionIndex++;
            this.isAnswered = false;
            this.loadQuestion();
        } else {
            // 所有题目完成，进入逃生或战斗选择
            this.scene.start('ChaseScene', {
                levelData: this.levelData,
                chapter: this.chapter,
                correctCount: this.correctCount
            });
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
        // 奇奇的疾风冲刺技能 - 自动答对一题
        this.showFeedback(true);
        this.correctCount++;
        window.gameState.collectedStars += 10;

        // 显示技能效果
        const skillEffect = this.add.text(0, -100, '疾风冲刺！', {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ffa500',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.feedbackContainer.add(skillEffect);

        // 延迟切换到下一题
        this.time.delayedCall(2000, () => {
            this.nextQuestion();
        });
    }

    useMiaomiaoSkill() {
        // 妙妙的能量护盾技能 - 免除一次错误
        this.showFeedbackText = this.add.text(0, -100, '能量护盾！', {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#9370db',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.feedbackContainer.add(this.showFeedbackText);

        // 允许再次答题
        this.isAnswered = false;
    }

    createSounds() {
        // 创建音效
        this.clickSound = this.sound.add('click');
        this.correctSound = this.sound.add('correct');
        this.wrongSound = this.sound.add('wrong');
    }
}