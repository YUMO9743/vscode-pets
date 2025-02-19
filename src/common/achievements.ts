import * as vscode from 'vscode';

interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    isUnlocked: boolean;
    unlockedAt?: Date;
    progress?: {
        current: number;
        required: number;
    };
}

export class AchievementSystem {
    private achievements: Map<string, Achievement>;
    private context: vscode.ExtensionContext;
    private statusBarItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext) {
        console.log('Initializing AchievementSystem');
        this.context = context;
        this.achievements = new Map();
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right
        );
        
        // Initialize with default achievements
        this.initializeAchievements();
        
        // Restore previously unlocked achievements
        this.loadProgress();
    }

    private initializeAchievements() {
        const defaultAchievements: Achievement[] = [
            {
                id: 'pet_collector',
                name: 'Pet Friend',
                description: 'Added your first pet friend',
                icon: '🐾',
                isUnlocked: false
            },

            {
                id: 'first_ball',
                name: 'Ball Thrower',
                description: 'Throw your first ball', 
                icon: '🎾', 
                isUnlocked: false
            },
            
            {
                id: 'coding_companion',
                name: 'Coding Companion',
                description: 'Code for 1 hour with your pet',
                icon: '⌨️',
                isUnlocked: false,
                progress: {
                    current: 0,
                    required: 60 // minutes
                }
            }
        ];

        defaultAchievements.forEach(achievement => {
            this.achievements.set(achievement.id, achievement);
        });
    }

    private async loadProgress() {
        const savedProgress = await this.context.globalState.get<{[key: string]: Achievement}>('vscode-pets.achievements');
        console.log('Loading saved achievements:', savedProgress);
        
        if (savedProgress) {
            Object.values(savedProgress).forEach(achievement => {
                if (this.achievements.has(achievement.id)) {
                    console.log(`Loading achievement ${achievement.id}, unlocked: ${achievement.isUnlocked}`);
                    this.achievements.set(achievement.id, achievement);
                }
            });
        }
        
        // Force an update after loading
        this.updateStatusBar();
    }

    private async saveProgress() {
        const achievementsObject = Object.fromEntries(
            Array.from(this.achievements.entries())
        );
        
        await this.context.globalState.update('vscode-pets.achievements', achievementsObject);
        this.updateStatusBar(); // Force update after save
    }

    private updateStatusBar() {
        // Log the current state of all achievements
        console.log('Updating status bar - Current achievements state:', 
            Array.from(this.achievements.entries()).map(([id, ach]) => 
                `${id}: ${ach.isUnlocked}`
            )
        );
        
        const unlockedCount = Array.from(this.achievements.values())
            .filter(a => {
                // Add explicit logging for each achievement's unlock state
                console.log(`${a.id}: isUnlocked = ${a.isUnlocked}`);
                return a.isUnlocked;
            }).length;
        
        const totalCount = this.achievements.size;
        console.log(`Setting status bar to: ${unlockedCount}/${totalCount}`);
        
        // Force the status bar update
        this.statusBarItem.text = `$(trophy) ${unlockedCount}/${totalCount}`;
        this.statusBarItem.tooltip = 'Click to view achievements';
        this.statusBarItem.command = 'vscode-pets.showAchievements';
        this.statusBarItem.show();
        
        // Force VS Code to update the UI
        this.statusBarItem.show();
    }

    public async showAchievements() {
        const achievementsList = Array.from(this.achievements.values())
            .map(achievement => {
                const status = achievement.isUnlocked ? '✅' : '🔒';
                const progress = achievement.progress 
                    ? ` (${achievement.progress.current}/${achievement.progress.required})`
                    : '';
                return `${achievement.icon} ${status} ${achievement.name}: ${achievement.description}${progress}`;
            })
            .join('\n');

        await vscode.window.showInformationMessage(
            `Achievements:\n${achievementsList}`,
            { modal: true }
        );
    }

    public async unlockAchievement(achievementId: string) {
        console.log(`Attempting to unlock achievement: ${achievementId}`);
        const achievement = this.achievements.get(achievementId);
        if (!achievement) {
            console.log(`Achievement ${achievementId} not found`);
            return;
        }
        
        if (achievement.isUnlocked) {
            console.log(`Achievement ${achievementId} already unlocked`);
            return;
        }
    
        // Create a new achievement object with the unlocked state
        const updatedAchievement = {
            ...achievement,
            isUnlocked: true,
            unlockedAt: new Date()
        };
        
        // Update the map with the new achievement object
        this.achievements.set(achievementId, updatedAchievement);
        
        console.log(`Achievement ${achievementId} new state:`, updatedAchievement);
    
        // Force an immediate status bar update
        this.updateStatusBar();
        
        await vscode.window.showInformationMessage(
            `🎉 Achievement Unlocked: ${updatedAchievement.name}\n${updatedAchievement.description}`
        );
    
        // Save progress after showing the message
        await this.saveProgress();
        
        // Force another status bar update after saving
        this.updateStatusBar();
    }
    
    public async updateProgress(achievementId: string, progress: number) {
        console.log(`Updating progress for achievement: ${achievementId}, progress: ${progress}`);
        const achievement = this.achievements.get(achievementId);
        if (!achievement || achievement.isUnlocked) {
            console.log(`Achievement ${achievementId} already unlocked or not found`);
            return;
        }
    
        if (achievement.progress) {
            const newProgress = Math.min(
                achievement.progress.required,
                achievement.progress.current + progress
            );
            console.log(`Progress updated from ${achievement.progress.current} to ${newProgress}`);
            achievement.progress.current = newProgress;
    
            // Update the Map with the new progress
            this.achievements.set(achievementId, achievement);
            
            // Force update the status bar
            this.updateStatusBar();
    
            if (achievement.progress.current >= achievement.progress.required) {
                await this.unlockAchievement(achievementId);
            }
        }
        await this.saveProgress();
    }
}