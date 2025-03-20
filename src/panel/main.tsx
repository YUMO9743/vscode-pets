// This script will be run within the webview itself
import { randomName } from '../common/names';
import React, { useState, useEffect } from 'react';
import Backpack from './components/Backpack';

import {
    PetSize,
    PetColor,
    PetType,
    Theme,
    ColorThemeKind,
    WebviewMessage,
} from '../common/types';
import { IPetType } from './states';
import {
    createPet,
    PetCollection,
    PetElement,
    IPetCollection,
    availableColors,
    InvalidPetException,
} from './pets';
import { BallState, PetElementState, PetPanelState } from './states';
let globalFoodCount = 4;

/* This is how the VS Code API can be invoked from the panel */
declare global {
    interface Window {
        feedPet: (petName: string) => void;
    }

    interface VscodeStateApi {
        getState(): PetPanelState | undefined; // API is actually Any, but we want it to be typed.
        setState(state: PetPanelState): void;
        postMessage(message: WebviewMessage): void;
    }
    function acquireVsCodeApi(): VscodeStateApi;

}




const PetApp = () => {
    const [isBackpackOpen, setIsBackpackOpen] = useState(false);
    const [foodCount, setFoodCount] = useState(4);
    const [pets, setPets] = useState([]);
    const vscode = acquireVsCodeApi();

    useEffect(() => {
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'update-backpack':
                    setFoodCount(message.foodCount);
                    break;
                case 'update-pets':
                    setPets(message.pets);
                    break;
                case 'show-backpack':
                    setIsBackpackOpen(true);
                    break;
            }
        });
    }, []);

    const handleFeedPet = (petName: string) => {
        if (foodCount > 0) {
            vscode.postMessage({
                command: 'feed-pet',
                petName: petName,
                text: `Feeding ${petName}`
            });
            setFoodCount(prev => prev - 1);
        }
    };

    return (
        <>
            <div id="petsContainer" />
            <canvas id="petCanvas" />
            <div id="foreground" />
            
            <Backpack 
                isOpen={isBackpackOpen}
                onClose={() => setIsBackpackOpen(false)}
                foodCount={foodCount}
                onFeed={handleFeedPet}
                pets={pets}
            />
        </>
    );
};

export default PetApp;




export var allPets: IPetCollection = new PetCollection();
var petCounter: number;

function calculateBallRadius(size: PetSize): number {
    if (size === PetSize.nano) {
        return 2;
    } else if (size === PetSize.small) {
        return 3;
    } else if (size === PetSize.medium) {
        return 4;
    } else if (size === PetSize.large) {
        return 8;
    } else {
        return 1; // Shrug
    }
}

function calculateFloor(size: PetSize, theme: Theme): number {
    switch (theme) {
        case Theme.forest:
            switch (size) {
                case PetSize.small:
                    return 30;
                case PetSize.medium:
                    return 40;
                case PetSize.large:
                    return 65;
                case PetSize.nano:
                default:
                    return 23;
            }
        case Theme.castle:
            switch (size) {
                case PetSize.small:
                    return 60;
                case PetSize.medium:
                    return 80;
                case PetSize.large:
                    return 120;
                case PetSize.nano:
                default:
                    return 45;
            }
        case Theme.beach:
            switch (size) {
                case PetSize.small:
                    return 60;
                case PetSize.medium:
                    return 80;
                case PetSize.large:
                    return 120;
                case PetSize.nano:
                default:
                    return 45;
            }
    }
    return 0;
}

function handleMouseOver(e: MouseEvent) {
    var el = e.currentTarget as HTMLDivElement;
    allPets.pets.forEach((element) => {
        if (element.collision === el && element.pet.canSwipe) {
            element.pet.swipe();
        }
    });
}

function startAnimations(
    collision: HTMLDivElement,
    pet: IPetType,
    stateApi?: VscodeStateApi,
) {
    if (!stateApi) {
        stateApi = acquireVsCodeApi();
    }

    collision.addEventListener('mouseover', handleMouseOver);
    setInterval(() => {
        var updates = allPets.seekNewFriends();
        updates.forEach((message) => {
            stateApi?.postMessage({
                text: message,
                command: 'info',
            });
        });
        pet.nextFrame();
        saveState(stateApi);
    }, 100);
}

function addPetToPanel(
    petType: PetType,
    basePetUri: string,
    petColor: PetColor,
    petSize: PetSize,
    left: number,
    bottom: number,
    floor: number,
    name: string,
    stateApi?: VscodeStateApi,
): PetElement {
    var petSpriteElement: HTMLImageElement = document.createElement('img');
    petSpriteElement.className = 'pet';
    (document.getElementById('petsContainer') as HTMLDivElement).appendChild(
        petSpriteElement,
    );

    var collisionElement: HTMLDivElement = document.createElement('div');
    collisionElement.className = 'collision';
    (document.getElementById('petsContainer') as HTMLDivElement).appendChild(
        collisionElement,
    );

    var speechBubbleElement: HTMLDivElement = document.createElement('div');
    speechBubbleElement.className = `bubble bubble-${petSize}`;
    speechBubbleElement.innerText = 'Hello!';
    (document.getElementById('petsContainer') as HTMLDivElement).appendChild(
        speechBubbleElement,
    );

    const root = basePetUri + '/' + petType + '/' + petColor;
    console.log('Creating new pet : ', petType, root, petColor, petSize, name);
    try {
        if (!availableColors(petType).includes(petColor)) {
            throw new InvalidPetException('Invalid color for pet type');
        }
        var newPet = createPet(
            petType,
            petSpriteElement,
            collisionElement,
            speechBubbleElement,
            petSize,
            left,
            bottom,
            root,
            floor,
            name,
        );
        petCounter++;
        startAnimations(collisionElement, newPet, stateApi);
    } catch (e: any) {
        // Remove elements
        petSpriteElement.remove();
        collisionElement.remove();
        speechBubbleElement.remove();
        throw e;
    }

    return new PetElement(
        petSpriteElement,
        collisionElement,
        speechBubbleElement,
        newPet,
        petColor,
        petType,
    );
}

export function saveState(stateApi?: VscodeStateApi) {
    if (!stateApi) {
        stateApi = acquireVsCodeApi();
    }
    var state = new PetPanelState();
    state.petStates = new Array();

    allPets.pets.forEach((petItem) => {
        state.petStates?.push({
            petName: petItem.pet.name,
            petColor: petItem.color,
            petType: petItem.type,
            petState: petItem.pet.getState(),
            petFriend: petItem.pet.friend?.name ?? undefined,
            elLeft: petItem.el.style.left,
            elBottom: petItem.el.style.bottom,
        });
    });
    state.petCounter = petCounter;
    stateApi?.setState(state);
}

function recoverState(
    basePetUri: string,
    petSize: PetSize,
    floor: number,
    stateApi?: VscodeStateApi,
) {
    if (!stateApi) {
        stateApi = acquireVsCodeApi();
    }
    var state = stateApi?.getState();
    if (!state) {
        petCounter = 1;
    } else {
        if (state.petCounter === undefined || isNaN(state.petCounter)) {
            petCounter = 1;
        } else {
            petCounter = state.petCounter ?? 1;
        }
    }

    var recoveryMap: Map<IPetType, PetElementState> = new Map();
    state?.petStates?.forEach((p) => {
        // Fixes a bug related to duck animations
        if ((p.petType as string) === 'rubber duck') {
            (p.petType as string) = 'rubber-duck';
        }

        try {
            var newPet = addPetToPanel(
                p.petType ?? PetType.cat,
                basePetUri,
                p.petColor ?? PetColor.brown,
                petSize,
                parseInt(p.elLeft ?? '0'),
                parseInt(p.elBottom ?? '0'),
                floor,
                p.petName ?? randomName(p.petType ?? PetType.cat),
                stateApi,
            );
            allPets.push(newPet);
            recoveryMap.set(newPet.pet, p);
        } catch (InvalidPetException) {
            console.log(
                'State had invalid pet (' + p.petType + '), discarding.',
            );
        }
    });
    recoveryMap.forEach((state, pet) => {
        // Recover previous state.
        if (state.petState !== undefined) {
            pet.recoverState(state.petState);
        }

        // Resolve friend relationships
        var friend = undefined;
        if (state.petFriend) {
            friend = allPets.locate(state.petFriend);
            if (friend) {
                pet.recoverFriend(friend.pet);
            }
        }
    });
}

console.log('Initializing experience bars for all pets');
setTimeout(() => {
    allPets.pets.forEach(pet => {
        pet.updateExperienceBar();
    });
}, 1000);

function randomStartPosition(): number {
    return Math.floor(Math.random() * (window.innerWidth * 0.7));
}

let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D;

function initCanvas() {
    canvas = document.getElementById('petCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.log('Canvas not ready');
        return;
    }
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) {
        console.log('Canvas context not ready');
        return;
    }
    ctx.canvas.width = window.innerWidth;
    ctx.canvas.height = window.innerHeight;
}

function createCustomModal(title: string, content: string, buttons: Array<{text: string, onClick: () => void}> = []) {
    // Remove any existing modal
    const existingModal = document.getElementById('custom-modal');
    if (existingModal) existingModal.remove();
    
    const modalContainer = document.createElement('div');
    modalContainer.id = 'custom-modal';
    modalContainer.style.position = 'fixed';
    modalContainer.style.top = '0';
    modalContainer.style.left = '0';
    modalContainer.style.width = '100%';
    modalContainer.style.height = '100%';
    modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalContainer.style.display = 'flex';
    modalContainer.style.justifyContent = 'center';
    modalContainer.style.alignItems = 'center';
    modalContainer.style.zIndex = '1000';
    
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#fff';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '8px';
    modalContent.style.maxWidth = '80%';
    modalContent.style.maxHeight = '80%';
    modalContent.style.overflow = 'auto';
    modalContent.style.color = '#333';
    
    const modalHeader = document.createElement('div');
    modalHeader.style.marginBottom = '15px';
    modalHeader.style.paddingBottom = '10px';
    modalHeader.style.borderBottom = '1px solid #eee';
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    
    const modalTitle = document.createElement('h2');
    modalTitle.textContent = title;
    modalTitle.style.margin = '0';
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = () => modalContainer.remove();
    
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);
    
    const modalBody = document.createElement('div');
    modalBody.innerHTML = content;
    
    const modalFooter = document.createElement('div');
    modalFooter.style.marginTop = '15px';
    modalFooter.style.paddingTop = '10px';
    modalFooter.style.borderTop = '1px solid #eee';
    modalFooter.style.display = 'flex';
    modalFooter.style.justifyContent = 'flex-end';
    
    buttons.forEach(button => {
        const btnElement = document.createElement('button');
        btnElement.textContent = button.text;
        btnElement.style.marginLeft = '10px';
        btnElement.style.padding = '8px 12px';
        btnElement.style.cursor = 'pointer';
        btnElement.style.backgroundColor = '#007bff';
        btnElement.style.color = 'white';
        btnElement.style.border = 'none';
        btnElement.style.borderRadius = '4px';
        btnElement.onclick = () => {
            button.onClick();
            modalContainer.remove();
        };
        modalFooter.appendChild(btnElement);
    });
    
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modalContainer.appendChild(modalContent);
    
    document.body.appendChild(modalContainer);
}

// It cannot access the main VS Code APIs directly.
export function petPanelApp(
    basePetUri: string,
    theme: Theme,
    themeKind: ColorThemeKind,
    petColor: PetColor,
    petSize: PetSize,
    petType: PetType,
    throwBallWithMouse: boolean,
    stateApi?: VscodeStateApi,
) {
    const ballRadius: number = calculateBallRadius(petSize);
    var floor = 0;

    const backpackState = { food: 4 };
    globalFoodCount = backpackState.food;
    
    if (!stateApi) {
        stateApi = acquireVsCodeApi();
    }
    // Apply Theme backgrounds
    const foregroundEl = document.getElementById('foreground');
    if (theme !== Theme.none) {
        var _themeKind = '';
        switch (themeKind) {
            case ColorThemeKind.dark:
                _themeKind = 'dark';
                break;
            case ColorThemeKind.light:
                _themeKind = 'light';
                break;
            case ColorThemeKind.highContrast:
            default:
                _themeKind = 'light';
                break;
        }

        document.body.style.backgroundImage = `url('${basePetUri}/backgrounds/${theme}/background-${_themeKind}-${petSize}.png')`;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        foregroundEl!.style.backgroundImage = `url('${basePetUri}/backgrounds/${theme}/foreground-${_themeKind}-${petSize}.png')`;

        floor = calculateFloor(petSize, theme); // Themes have pets at a specified height from the ground
    } else {
        document.body.style.backgroundImage = '';
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        foregroundEl!.style.backgroundImage = '';
    }

    /// Bouncing ball components, credit https://stackoverflow.com/a/29982343
    const gravity: number = 0.6,
        damping: number = 0.9,
        traction: number = 0.8,
        interval: number = 1000 / 24; // msec for single frame
    let then: number = 0; // last draw
    var ballState: BallState;

    function resetBall() {
        if (ballState) {
            ballState.paused = true;
        }
        if (canvas) {
            canvas.style.display = 'block';
        }
        ballState = new BallState(100, 100, 4, 5);
    }

    function dynamicThrowOn() {
        let startMouseX: number;
        let startMouseY: number;
        let endMouseX: number;
        let endMouseY: number;
        console.log('Enabling dynamic throw');
        window.onmousedown = (e) => {
            if (ballState) {
                ballState.paused = true;
            }
            if (canvas) {
                canvas.style.display = 'block';
            }
            endMouseX = e.clientX;
            endMouseY = e.clientY;
            startMouseX = e.clientX;
            startMouseY = e.clientY;
            ballState = new BallState(e.clientX, e.clientY, 0, 0);

            allPets.pets.forEach((petEl) => {
                if (petEl.pet.canChase) {
                    petEl.pet.chase(ballState, canvas);
                }
            });
            ballState.paused = true;

            drawBall();

            window.onmousemove = (ev) => {
                ev.preventDefault();
                if (ballState) {
                    ballState.paused = true;
                }
                startMouseX = endMouseX;
                startMouseY = endMouseY;
                endMouseX = ev.clientX;
                endMouseY = ev.clientY;
                ballState = new BallState(ev.clientX, ev.clientY, 0, 0);
                drawBall();
            };
            window.onmouseup = (ev) => {
                ev.preventDefault();
                window.onmouseup = null;
                window.onmousemove = null;

                ballState = new BallState(
                    endMouseX,
                    endMouseY,
                    endMouseX - startMouseX,
                    endMouseY - startMouseY,
                );
                allPets.pets.forEach((petEl) => {
                    if (petEl.pet.canChase) {
                        petEl.pet.chase(ballState, canvas);
                    }
                });
                throwBall();
            };
        };
    }
    function dynamicThrowOff() {
        console.log('Disabling dynamic throw');
        window.onmousedown = null;
        if (ballState) {
            ballState.paused = true;
        }
        if (canvas) {
            canvas.style.display = 'none';
        }
    }
    function throwBall() {
        if (!ballState.paused) {
            requestAnimationFrame(throwBall);
        }

        // throttling the frame rate
        const now = Date.now();
        const elapsed = now - then;
        if (elapsed <= interval) {
            return;
        }
        then = now - (elapsed % interval);

        if (ballState.cx + ballRadius >= canvas.width) {
            ballState.vx = -ballState.vx * damping;
            ballState.cx = canvas.width - ballRadius;
        } else if (ballState.cx - ballRadius <= 0) {
            ballState.vx = -ballState.vx * damping;
            ballState.cx = ballRadius;
        }
        if (ballState.cy + ballRadius + floor >= canvas.height) {
            ballState.vy = -ballState.vy * damping;
            ballState.cy = canvas.height - ballRadius - floor;
            // traction here
            ballState.vx *= traction;
        } else if (ballState.cy - ballRadius <= 0) {
            ballState.vy = -ballState.vy * damping;
            ballState.cy = ballRadius;
        }

        ballState.vy += gravity;

        ballState.cx += ballState.vx;
        ballState.cy += ballState.vy;
        drawBall();
    }

    function drawBall() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.arc(ballState.cx, ballState.cy, ballRadius, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#2ed851';
        ctx.fill();
    }

    console.log(
        'Starting pet session',
        petColor,
        basePetUri,
        petType,
        throwBallWithMouse,
    );

    // New session
    var state = stateApi?.getState();
    if (!state) {
        console.log('No state, starting a new session.');
        petCounter = 1;
        allPets.push(
            addPetToPanel(
                petType,
                basePetUri,
                petColor,
                petSize,
                randomStartPosition(),
                floor,
                floor,
                randomName(petType),
                stateApi,
            ),
        );
        saveState(stateApi);
    } else {
        console.log('Recovering state - ', state);
        recoverState(basePetUri, petSize, floor, stateApi);
    }

    initCanvas();

    if (throwBallWithMouse) {
        dynamicThrowOn();
    } else {
        dynamicThrowOff();
    }

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', (event): void => {
        const message = event.data; // The json data that the extension sent
        switch (message.command) {
            case 'throw-with-mouse':
                if (message.enabled) {
                    dynamicThrowOn();
                } else {
                    dynamicThrowOff();
                }
                break;
            case 'throw-ball':
                resetBall();
                throwBall();
                allPets.pets.forEach((petEl) => {
                    if (petEl.pet.canChase) {
                        petEl.pet.chase(ballState, canvas);
                    }
                });
                stateApi?.postMessage({
                    command: 'unlock-achievement',
                    achievementId: 'first_ball',
                    text: ''
                });
                break;
            case 'spawn-pet':
                allPets.push(
                    addPetToPanel(
                        message.type,
                        basePetUri,
                        message.color,
                        petSize,
                        randomStartPosition(),
                        floor,
                        floor,
                        message.name ?? randomName(message.type),
                        stateApi,
                    ),
                );
                stateApi?.postMessage({
                    command: 'unlock-achievement',
                    achievementId: 'pet_collector',
                    text: ''
                });
                saveState(stateApi);
                break;

            case 'list-pets':
                var pets = allPets.pets;
                stateApi?.postMessage({
                    command: 'list-pets',
                    text: pets
                        .map(
                            (pet) => `${pet.type},${pet.pet.name},${pet.color}`,
                        )
                        .join('\n'),
                });
                break;

            case 'show-backpack':
                console.log('Show backpack command received');
                createCustomModal(
                    '🎒 Backpack',
                    `<div style="font-size: 16px; margin-bottom: 15px;">
                        <p style="margin-bottom: 10px;"><strong>Food Items:</strong></p>
                        <p>🍖 Food: ${backpackState.food}</p>
                    </div>`,
                    [{ text: 'Close', onClick: () => {} }]
                );
                break;
                
            case 'update-backpack':
                console.log('Update backpack command received:', message.foodCount);
                if (typeof message.foodCount === 'number') {
                    backpackState.food = message.foodCount;
                    globalFoodCount = message.foodCount;
                }
                break;
                
            function showDebugMessage(message: string) {
                let debugContainer = document.getElementById('debug-container');
                if (!debugContainer) {
                    debugContainer = document.createElement('div');
                    debugContainer.id = 'debug-container';
                    debugContainer.style.position = 'fixed';
                    debugContainer.style.bottom = '10px';
                    debugContainer.style.right = '10px';
                    debugContainer.style.width = '300px';
                    debugContainer.style.maxHeight = '200px';
                    debugContainer.style.overflow = 'auto';
                    debugContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                    debugContainer.style.color = 'white';
                    debugContainer.style.padding = '10px';
                    debugContainer.style.borderRadius = '5px';
                    debugContainer.style.zIndex = '1000';
                    debugContainer.style.fontSize = '12px';
                    document.body.appendChild(debugContainer);
                }
                
                // 添加新消息
                const msgElement = document.createElement('div');
                msgElement.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
                debugContainer.appendChild(msgElement);
                
                // 自动滚动到底部
                debugContainer.scrollTop = debugContainer.scrollHeight;
                
                // 限制消息数量
                while (debugContainer.childNodes.length > 20) {
                    debugContainer.removeChild(debugContainer.firstChild as Node);
                }
            }
            
            case 'list-pets-for-feeding':
                showDebugMessage('收到喂食宠物列表请求');
                
                const petsForFeeding = allPets.pets;
                if (petsForFeeding.length === 0) {
                    showDebugMessage('没有可喂食的宠物');
                    return;
                }
                
                if (backpackState.food <= 0) {
                    showDebugMessage('背包中没有食物');
                    return;
                }
                
                const feedingContainer = document.createElement('div');
                feedingContainer.id = 'feeding-container';
                feedingContainer.style.position = 'fixed';
                feedingContainer.style.top = '50%';
                feedingContainer.style.left = '50%';
                feedingContainer.style.transform = 'translate(-50%, -50%)';
                feedingContainer.style.backgroundColor = 'white';
                feedingContainer.style.padding = '20px';
                feedingContainer.style.borderRadius = '8px';
                feedingContainer.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                feedingContainer.style.zIndex = '1001';
                feedingContainer.style.maxWidth = '400px';
                feedingContainer.style.width = '80%';
                
                // 添加标题
                const title = document.createElement('h2');
                title.textContent = '选择要喂食的宠物';
                title.style.marginBottom = '15px';
                feedingContainer.appendChild(title);
                
                // 添加宠物列表
                petsForFeeding.forEach(pet => {
                    const feedButton = document.createElement('button');
                    feedButton.textContent = `${pet.pet.name} (${pet.color} ${pet.type})`;
                    feedButton.style.display = 'block';
                    feedButton.style.width = '100%';
                    feedButton.style.padding = '10px';
                    feedButton.style.marginBottom = '10px';
                    feedButton.style.textAlign = 'left';
                    feedButton.style.background = '#f5f5f5';
                    feedButton.style.border = '1px solid #ddd';
                    feedButton.style.borderRadius = '4px';
                    feedButton.style.cursor = 'pointer';
                    
                    // 添加点击事件 - 使用直接的宠物喂食方法
                    feedButton.onclick = function() {
                        showDebugMessage(`点击喂食按钮: ${pet.pet.name}`);
                        
                        // 直接更新宠物经验值，不经过消息传递
                        if (backpackState.food > 0) {
                            backpackState.food--;
                            showDebugMessage(`背包食物减少到: ${backpackState.food}`);
                            
                            // 直接更新宠物经验值
                            pet.addExperience(5);
                            showDebugMessage(`已增加宠物经验: ${pet.pet.name}`);
                            
                            // 更新UI
                            pet.updateExperienceBar();
                            pet.pet.showSpeechBubble('😋', 2000);
                            
                            // 显示成功消息
                            alert(`成功喂食宠物 ${pet.pet.name}!`);
                            
                            // 关闭喂食面板
                            feedingContainer.remove();
                            
                            // 尝试发送消息以更新背包状态
                            try {
                                const vscode = acquireVsCodeApi();
                                vscode.postMessage({
                                    command: 'update-backpack-state',
                                    foodCount: backpackState.food,
                                    text:''
                                });
                                showDebugMessage('已发送背包更新消息');
                            } catch (error) {
                                showDebugMessage('发送背包更新消息失败，但宠物已被喂食');
                            }
                        } else {
                            showDebugMessage('没有食物可用');
                            alert('背包中没有食物了!');
                            feedingContainer.remove();
                        }
                    };
                    
                    feedingContainer.appendChild(feedButton);
                });
                
                // 添加关闭按钮
                const closeButton = document.createElement('button');
                closeButton.textContent = '关闭';
                closeButton.style.padding = '8px 16px';
                closeButton.style.backgroundColor = '#007bff';
                closeButton.style.color = 'white';
                closeButton.style.border = 'none';
                closeButton.style.borderRadius = '4px';
                closeButton.style.cursor = 'pointer';
                closeButton.style.float = 'right';
                closeButton.onclick = function() {
                    feedingContainer.remove();
                };
                feedingContainer.appendChild(closeButton);
                
                // 添加到文档
                document.body.appendChild(feedingContainer);
                showDebugMessage('已显示宠物喂食面板');
                break;
                    

            case 'pet-fed':
                console.log('Pet fed command received:', message.petName);
                if (message.petName) {
                    const fedPet = allPets.locate(message.petName);
                    if (fedPet) {
                        console.log(`${message.petName} fed, updating UI`);
                        // 确保更新经验条
                        fedPet.updateExperienceBar();
                        fedPet.pet.showSpeechBubble('😋', 2000);
                        console.log(`${message.petName} gained 5 experience!`);
                        
                        // 显示喂食成功消息
                        createCustomModal(
                            'Pet Fed',
                            `<p>${message.petName} has been fed and gained 5 experience points!</p>
                                <p>Current level: ${fedPet.stats.level}</p>
                                <p>Experience: ${fedPet.stats.experience}/${fedPet.stats.level * 20}</p>`,
                            [{ text: 'OK', onClick: () => {} }]
                        );
                        
                        // 更新本地食物计数
                        globalFoodCount = Math.max(0, globalFoodCount - 1);
                    } else {
                        console.log(`Pet ${message.petName} not found in collection!`);
                        createCustomModal(
                            'Error',
                            `<p>Could not find pet ${message.petName}!</p>`,
                            [{ text: 'OK', onClick: () => {} }]
                        );
                    }
                }
                break;
                
            case 'roll-call':
                var pets = allPets.pets;
                // go through every single
                // pet and then print out their name
                pets.forEach((pet) => {
                    stateApi?.postMessage({
                        command: 'info',
                        text: `${pet.pet.emoji} ${pet.pet.name} (${pet.color} ${pet.type}): ${pet.pet.hello}`,
                    });
                });
            case 'delete-pet':
                var pet = allPets.locatePet(
                    message.name,
                    message.type,
                    message.color,
                );
                if (pet) {
                    allPets.remove(pet);
                    saveState(stateApi);
                    stateApi?.postMessage({
                        command: 'info',
                        text: '👋 Removed pet ' + message.name,
                    });
                } else {
                    stateApi?.postMessage({
                        command: 'error',
                        text: `Could not find pet ${message.name}`,
                    });
                }
                break;
            case 'reset-pet':
                allPets.reset();
                petCounter = 0;
                saveState(stateApi);
                break;
            case 'pause-pet':
                petCounter = 1;
                saveState(stateApi);
                break;
        }
    });
}
window.addEventListener('resize', function () {
    initCanvas();
});
