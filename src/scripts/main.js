// 奇迹森林大冒险 - 主游戏文件
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { CharacterSelectScene } from './scenes/CharacterSelectScene.js';
import { DifficultySelectScene } from './scenes/DifficultySelectScene.js';
import { LevelScene } from './scenes/LevelScene.js';
import { PuzzleScene } from './scenes/PuzzleScene.js';
import { ChaseScene } from './scenes/ChaseScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { ResultScene } from './scenes/ResultScene.js';

// 游戏配置
const config = {
    type: Phaser.AUTO,
    width: 720,
    height: 1280,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [
        BootScene,
        PreloadScene,
        CharacterSelectScene,
        DifficultySelectScene,
        LevelScene,
        PuzzleScene,
        ChaseScene,
        BattleScene,
        ResultScene
    ]
};

// 创建游戏实例
const game = new Phaser.Game(config);

// 全局游戏状态
window.gameState = {
    selectedCharacter: null,
    selectedDifficulty: null,
    currentLevel: 1,
    currentChapter: 1,
    collectedParts: [],
    collectedStars: 0,
    unlockedWeapons: [],
    skillEnergy: 0,
    isSoundOn: true,
    isMusicOn: true
};

// 导出游戏实例以便其他模块访问
export default game;