import * as vscode from 'vscode';
import { ColorThemeKind } from 'vscode';
import {
    PetSize,
    PetColor,
    PetType,
    ExtPosition,
    Theme,
    WebviewMessage,
    ALL_COLORS,
    ALL_PETS,
    ALL_SCALES,
    ALL_THEMES,
    BackpackState,
} from '../common/types';
import { randomName } from '../common/names';
import * as localize from '../common/localize';
import { availableColors, normalizeColor } from '../panel/pets';
import { AchievementSystem } from '../common/achievements';
import { IPetCollection, PetCollection } from '../panel/pets';
const BACKPACK_STATE_KEY = 'vscode-pets.backpack-state';
let achievementSystem: AchievementSystem;

let backpackState: BackpackState = { foodCount: 4 };
let petCollection: IPetCollection;


const EXTRA_PETS_KEY = 'vscode-pets.extra-pets';
const EXTRA_PETS_KEY_TYPES = EXTRA_PETS_KEY + '.types';
const EXTRA_PETS_KEY_COLORS = EXTRA_PETS_KEY + '.colors';
const EXTRA_PETS_KEY_NAMES = EXTRA_PETS_KEY + '.names';
const DEFAULT_PET_SCALE = PetSize.nano;
const DEFAULT_COLOR = PetColor.brown;
const DEFAULT_PET_TYPE = PetType.cat;
const DEFAULT_POSITION = ExtPosition.panel;
const DEFAULT_THEME = Theme.none;


class PetQuickPickItem implements vscode.QuickPickItem {
    constructor(
        public readonly name_: string,
        public readonly type: string,
        public readonly color: string,
    ) {
        this.name = name_;
        this.label = name_;
        this.description = `${color} ${type}`;
    }

    name: string;
    label: string;
    kind?: vscode.QuickPickItemKind | undefined;
    description?: string | undefined;
    detail?: string | undefined;
    picked?: boolean | undefined;
    alwaysShow?: boolean | undefined;
    buttons?: readonly vscode.QuickInputButton[] | undefined;
}

let webviewViewProvider: PetWebviewViewProvider;

function getConfiguredSize(): PetSize {
    var size = vscode.workspace
        .getConfiguration('vscode-pets')
        .get<PetSize>('petSize', DEFAULT_PET_SCALE);
    if (ALL_SCALES.lastIndexOf(size) === -1) {
        size = DEFAULT_PET_SCALE;
    }
    return size;
}

function getConfiguredTheme(): Theme {
    var theme = vscode.workspace
        .getConfiguration('vscode-pets')
        .get<Theme>('theme', DEFAULT_THEME);
    if (ALL_THEMES.lastIndexOf(theme) === -1) {
        theme = DEFAULT_THEME;
    }
    return theme;
}

function getConfiguredThemeKind(): ColorThemeKind {
    return vscode.window.activeColorTheme.kind;
}

function getConfigurationPosition() {
    return vscode.workspace
        .getConfiguration('vscode-pets')
        .get<ExtPosition>('position', DEFAULT_POSITION);
}

function getThrowWithMouseConfiguration(): boolean {
    return vscode.workspace
        .getConfiguration('vscode-pets')
        .get<boolean>('throwBallWithMouse', true);
}

function updatePanelThrowWithMouse(): void {
    const panel = getPetPanel();
    if (panel !== undefined) {
        panel.setThrowWithMouse(getThrowWithMouseConfiguration());
    }
}

async function updateExtensionPositionContext() {
    await vscode.commands.executeCommand(
        'setContext',
        'vscode-pets.position',
        getConfigurationPosition(),
    );
}

export class PetSpecification {
    color: PetColor;
    type: PetType;
    size: PetSize;
    name: string;

    constructor(color: PetColor, type: PetType, size: PetSize, name?: string) {
        this.color = color;
        this.type = type;
        this.size = size;
        if (!name) {
            this.name = randomName(type);
        } else {
            this.name = name;
        }
    }

    static fromConfiguration(): PetSpecification {
        var color = vscode.workspace
            .getConfiguration('vscode-pets')
            .get<PetColor>('petColor', DEFAULT_COLOR);
        if (ALL_COLORS.lastIndexOf(color) === -1) {
            color = DEFAULT_COLOR;
        }
        var type = vscode.workspace
            .getConfiguration('vscode-pets')
            .get<PetType>('petType', DEFAULT_PET_TYPE);
        if (ALL_PETS.lastIndexOf(type) === -1) {
            type = DEFAULT_PET_TYPE;
        }

        return new PetSpecification(color, type, getConfiguredSize());
    }

    static collectionFromMemento(
        context: vscode.ExtensionContext,
        size: PetSize,
    ): PetSpecification[] {
        var contextTypes = context.globalState.get<PetType[]>(
            EXTRA_PETS_KEY_TYPES,
            [],
        );
        var contextColors = context.globalState.get<PetColor[]>(
            EXTRA_PETS_KEY_COLORS,
            [],
        );
        var contextNames = context.globalState.get<string[]>(
            EXTRA_PETS_KEY_NAMES,
            [],
        );
        var result: PetSpecification[] = new Array();
        for (let index = 0; index < contextTypes.length; index++) {
            result.push(
                new PetSpecification(
                    contextColors?.[index] ?? DEFAULT_COLOR,
                    contextTypes[index],
                    size,
                    contextNames[index],
                ),
            );
        }
        return result;
    }
}

export async function storeCollectionAsMemento(
    context: vscode.ExtensionContext,
    collection: PetSpecification[],
) {
    var contextTypes = new Array(collection.length);
    var contextColors = new Array(collection.length);
    var contextNames = new Array(collection.length);
    for (let index = 0; index < collection.length; index++) {
        contextTypes[index] = collection[index].type;
        contextColors[index] = collection[index].color;
        contextNames[index] = collection[index].name;
    }
    await context.globalState.update(EXTRA_PETS_KEY_TYPES, contextTypes);
    await context.globalState.update(EXTRA_PETS_KEY_COLORS, contextColors);
    await context.globalState.update(EXTRA_PETS_KEY_NAMES, contextNames);
    context.globalState.setKeysForSync([
        EXTRA_PETS_KEY_TYPES,
        EXTRA_PETS_KEY_COLORS,
        EXTRA_PETS_KEY_NAMES,
    ]);
}

let spawnPetStatusBar: vscode.StatusBarItem;

interface IPetInfo {
    type: PetType;
    name: string;
    color: PetColor;
}

async function handleRemovePetMessage(
    this: vscode.ExtensionContext,
    message: WebviewMessage,
) {
    var petList: IPetInfo[] = Array();
    switch (message.command) {
        case 'list-pets':
            message.text.split('\n').forEach((pet) => {
                if (!pet) {
                    return;
                }
                var parts = pet.split(',');
                petList.push({
                    type: parts[0] as PetType,
                    name: parts[1],
                    color: parts[2] as PetColor,
                });
            });
            break;
        default:
            return;
    }
    if (!petList) {
        return;
    }
    if (!petList.length) {
        await vscode.window.showErrorMessage(
            vscode.l10n.t('There are no pets to remove.'),
        );
        return;
    }
    await vscode.window
        .showQuickPick<PetQuickPickItem>(
            petList.map((val) => {
                return new PetQuickPickItem(val.name, val.type, val.color);
            }),
            {
                placeHolder: vscode.l10n.t('Select the pet to remove.'),
            },
        )
        .then(async (pet: PetQuickPickItem | undefined) => {
            if (pet) {
                const panel = getPetPanel();
                if (panel !== undefined) {
                    panel.deletePet(pet.name, pet.type, pet.color);
                    const collection = petList
                        .filter((item) => {
                            return item.name !== pet.name;
                        })
                        .map<PetSpecification>((item) => {
                            return new PetSpecification(
                                item.color,
                                item.type,
                                PetSize.medium,
                                item.name,
                            );
                        });
                    await storeCollectionAsMemento(this, collection);
                }
            }
        });
}

function getPetPanel(): IPetPanel | undefined {
    if (
        getConfigurationPosition() === ExtPosition.explorer &&
        webviewViewProvider
    ) {
        return webviewViewProvider;
    } else if (PetPanel.currentPanel) {
        return PetPanel.currentPanel;
    } else {
        return undefined;
    }
}

function getWebview(): vscode.Webview | undefined {
    if (
        getConfigurationPosition() === ExtPosition.explorer &&
        webviewViewProvider
    ) {
        return webviewViewProvider.getWebview();
    } else if (PetPanel.currentPanel) {
        return PetPanel.currentPanel.getWebview();
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Add to activate function
    petCollection = new PetCollection();
    backpackState = context.globalState.get<BackpackState>(BACKPACK_STATE_KEY, { foodCount: 4 });
    console.log('Loaded backpack state at activation:', backpackState);

    function registerMessageHandlers(webview: vscode.Webview) {
        console.log('Registering message handlers for webview');
        setupMessageHandlers(webview);
    }

    if (PetPanel.currentPanel) {
        registerMessageHandlers(PetPanel.currentPanel.getWebview());
    }
    async function setupMessageHandlers(webview: vscode.Webview) {
        console.log('Setting up message handlers for webview');
        webview.onDidReceiveMessage(
            async (message) => {
                console.log('Message received from webview:', message.command, message);
                
                if (message.command === 'feed-pet' && message.petName) {
                    console.log('Feed pet message received with name:', message.petName);
                    if (backpackState.foodCount > 0) {
                        backpackState.foodCount--;
                        // 确保存储背包状态
                        await context.globalState.update(BACKPACK_STATE_KEY, backpackState);
                        console.log('Updated backpack state in global state:', backpackState);
                        const verifyState = context.globalState.get<BackpackState>(BACKPACK_STATE_KEY);
                        console.log('Verification - saved state:', verifyState);



                        const panel = getPetPanel();
                        if (panel && message.petName) {
                            console.log('Calling feedPet() on panel');
                            panel.feedPet(message.petName);
                            console.log('Calling updateBackpack() on panel');
                            panel.updateBackpack(backpackState.foodCount);
                            console.log('Pet fed and backpack updated, remaining food:', backpackState.foodCount);
                        } else {
                            console.error('Panel or pet name not available:', 
                                panel ? 'Panel available' : 'Panel NOT available',
                                message.petName ? 'Pet name available' : 'Pet name NOT available');
                        }
                    } else {
                        console.log('No food left in backpack');
                        vscode.window.showInformationMessage('No food left in your backpack!');
                    }
                    return;
                } else if (message.command === 'update-backpack-state') {
                    // 添加这个新分支以处理直接更新背包状态的消息
                    console.log('Received direct backpack update message:', message);
                    if (typeof message.foodCount === 'number') {
                        backpackState.foodCount = message.foodCount;
                        try {
                            await context.globalState.update(BACKPACK_STATE_KEY, {...backpackState});
                            console.log('Backpack state updated directly:', backpackState);
                        } catch (e) {
                            console.error('Failed to update global state:', e);
                        }
                    }
                } else {
                    await handleWebviewMessage(message);
                }
            },
            undefined,
            context.subscriptions
        );
        console.log('Message handlers setup complete');
    }
    // if (PetPanel.currentPanel) {
    //     setupMessageHandlers(PetPanel.currentPanel.getWebview());
    // }


    async function handleBackpackMessages(message: WebviewMessage) {
        console.log('handleBackpackMessages called but not processing messages', message.command);
    }
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.show-backpack', async () => {
            console.log('Show backpack command triggered');
            try {
                const savedState = context.globalState.get<BackpackState>(BACKPACK_STATE_KEY);
                if (savedState && typeof savedState.foodCount === 'number') {
                    backpackState = savedState;
                }
            } catch (e) {
                console.error('Error reloading backpack state:', e);
            }
            console.log('Current backpack state from storage:', backpackState);

            const panel = getPetPanel();
            if (panel) {
                console.log('Sending showBackpack to panel');
                panel.showBackpack();
                console.log('Sending updateBackpack with current food count:', backpackState.foodCount);
                panel.updateBackpack(backpackState.foodCount);
            } else {
                console.log('No panel found');
            }
        })
    );
    if (PetPanel.currentPanel) {
        PetPanel.currentPanel.getWebview().onDidReceiveMessage(
            async (message) => {
                await handleBackpackMessages(message);
            },
            undefined,
            context.subscriptions
        );
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.test-state', async () => {
            console.log('Testing state persistence...');
            console.log('Before update:', context.globalState.get(BACKPACK_STATE_KEY));
            
            // 尝试更新状态
            const testState = { foodCount: Math.floor(Math.random() * 10) };
            await context.globalState.update(BACKPACK_STATE_KEY, testState);
            console.log('After update:', context.globalState.get(BACKPACK_STATE_KEY));
            
            vscode.window.showInformationMessage(`State updated to: ${JSON.stringify(testState)}`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.feed-pet', async () => {
            console.log('Feed pet command triggered');
            const panel = getPetPanel();
            if (panel !== undefined) {
                console.log('Sending listPetsForFeeding to panel');
                panel.listPetsForFeeding();
            } else {
                console.log('No panel found');
            }
        })
    );

    achievementSystem = new AchievementSystem(context);
    // Register the achievement viewing command
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.showAchievements', async () => {
            await achievementSystem.showAchievements();
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.start', async () => {
            if (
                getConfigurationPosition() === ExtPosition.explorer &&
                webviewViewProvider
            ) {
                await vscode.commands.executeCommand('petsView.focus');
            } else {
                const spec = PetSpecification.fromConfiguration();
                PetPanel.createOrShow(
                    context.extensionUri,
                    spec.color,
                    spec.type,
                    spec.size,
                    getConfiguredTheme(),
                    getConfiguredThemeKind(),
                    getThrowWithMouseConfiguration(),
                );

                if (PetPanel.currentPanel) {
                    setupMessageHandlers(PetPanel.currentPanel.getWebview());
                    var collection = PetSpecification.collectionFromMemento(
                        context,
                        getConfiguredSize(),
                    );
                    collection.forEach((item) => {
                        PetPanel.currentPanel?.spawnPet(item);
                    });
                    // Store the collection in the memento, incase any of the null values (e.g. name) have been set
                    await storeCollectionAsMemento(context, collection);
                }
            }
        }),

        
    );

    spawnPetStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100,
    );
    spawnPetStatusBar.command = 'vscode-pets.spawn-pet';
    context.subscriptions.push(spawnPetStatusBar);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
    );
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(updateStatusBar),
    );
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(
            updateExtensionPositionContext,
        ),
    );
    updateStatusBar();

    const spec = PetSpecification.fromConfiguration();
    webviewViewProvider = new PetWebviewViewProvider(
        context.extensionUri,
        spec.color,
        spec.type,
        spec.size,
        getConfiguredTheme(),
        getConfiguredThemeKind(),
        getThrowWithMouseConfiguration(),
    );
    updateExtensionPositionContext().catch((e) => {
        console.error(e);
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            PetWebviewViewProvider.viewType,
            webviewViewProvider,
        ),
    );

    webviewViewProvider.onReady = (webview) => {
        setupMessageHandlers(webview);
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.throw-ball', () => {
            const panel = getPetPanel();
            if (panel !== undefined) {
                panel.throwBall();
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.delete-pet', async () => {
            const panel = getPetPanel();
            if (panel !== undefined) {
                panel.listPets();
                getWebview()?.onDidReceiveMessage(
                    handleRemovePetMessage,
                    context,
                );
            } else {
                await createPetPlayground(context);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.roll-call', async () => {
            const panel = getPetPanel();
            if (panel !== undefined) {
                panel.rollCall();
            } else {
                await createPetPlayground(context);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'vscode-pets.export-pet-list',
            async () => {
                const pets = PetSpecification.collectionFromMemento(
                    context,
                    getConfiguredSize(),
                );
                const petJson = JSON.stringify(pets, null, 2);
                const fileName = `pets-${Date.now()}.json`;
                if (!vscode.workspace.workspaceFolders) {
                    await vscode.window.showErrorMessage(
                        vscode.l10n.t(
                            'You must have a folder or workspace open to export pets.',
                        ),
                    );
                    return;
                }
                const filePath = vscode.Uri.joinPath(
                    vscode.workspace.workspaceFolders[0].uri,
                    fileName,
                );
                const newUri = vscode.Uri.file(fileName).with({
                    scheme: 'untitled',
                    path: filePath.fsPath,
                });
                await vscode.workspace
                    .openTextDocument(newUri)
                    .then(async (doc) => {
                        await vscode.window
                            .showTextDocument(doc)
                            .then(async (editor) => {
                                await editor.edit((edit) => {
                                    edit.insert(
                                        new vscode.Position(0, 0),
                                        petJson,
                                    );
                                });
                            });
                    });
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'vscode-pets.import-pet-list',
            async () => {
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Open pets.json',
                    filters: {
                        json: ['json'],
                    },
                };
                const fileUri = await vscode.window.showOpenDialog(options);

                if (fileUri && fileUri[0]) {
                    console.log('Selected file: ' + fileUri[0].fsPath);
                    try {
                        const fileContents = await vscode.workspace.fs.readFile(
                            fileUri[0],
                        );
                        const petsToLoad = JSON.parse(
                            String.fromCharCode.apply(
                                null,
                                Array.from(fileContents),
                            ),
                        );

                        // load the pets into the collection
                        var collection = PetSpecification.collectionFromMemento(
                            context,
                            getConfiguredSize(),
                        );
                        // fetch just the pet types
                        const panel = getPetPanel();
                        for (let i = 0; i < petsToLoad.length; i++) {
                            const pet = petsToLoad[i];
                            const petSpec = new PetSpecification(
                                normalizeColor(pet.color, pet.type),
                                pet.type,
                                pet.size,
                                pet.name,
                            );
                            collection.push(petSpec);
                            if (panel !== undefined) {
                                panel.spawnPet(petSpec);
                            }
                        }
                        await storeCollectionAsMemento(context, collection);
                    } catch (e: any) {
                        await vscode.window.showErrorMessage(
                            vscode.l10n.t(
                                'Failed to import pets: {0}',
                                e?.message,
                            ),
                        );
                    }
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.spawn-pet', async () => {
            const panel = getPetPanel();
            if (
                getConfigurationPosition() === ExtPosition.explorer &&
                webviewViewProvider
            ) {
                await vscode.commands.executeCommand('petsView.focus');
            }
            if (panel) {
                const selectedPetType = await vscode.window.showQuickPick(
                    localize.stringListAsQuickPickItemList<PetType>(ALL_PETS),
                    {
                        placeHolder: vscode.l10n.t('Select a pet'),
                    },
                );
                if (selectedPetType === undefined) {
                    console.log(
                        'Cancelled Spawning Pet - No Pet Type Selected',
                    );
                    return;
                }
                var petColor: PetColor = DEFAULT_COLOR;
                const possibleColors = availableColors(selectedPetType.value);

                if (possibleColors.length > 1) {
                    var selectedColor = await vscode.window.showQuickPick(
                        localize.stringListAsQuickPickItemList<PetColor>(
                            possibleColors,
                        ),
                        {
                            placeHolder: vscode.l10n.t('Select a color'),
                        },
                    );
                    if (selectedColor === undefined) {
                        console.log(
                            'Cancelled Spawning Pet - No Pet Color Selected',
                        );
                        return;
                    }
                    petColor = selectedColor.value;
                } else {
                    petColor = possibleColors[0];
                }

                if (petColor === undefined) {
                    console.log(
                        'Cancelled Spawning Pet - No Pet Color Selected',
                    );
                    return;
                }

                const name = await vscode.window.showInputBox({
                    placeHolder: vscode.l10n.t('Leave blank for a random name'),
                    prompt: vscode.l10n.t('Name your pet'),
                    value: randomName(selectedPetType.value),
                });
                const spec = new PetSpecification(
                    petColor,
                    selectedPetType.value,
                    getConfiguredSize(),
                    name,
                );
                if (!spec.type || !spec.color || !spec.size) {
                    return vscode.window.showWarningMessage(
                        vscode.l10n.t('Cancelled Spawning Pet'),
                    );
                } else if (spec) {
                    panel.spawnPet(spec);
                }
                var collection = PetSpecification.collectionFromMemento(
                    context,
                    getConfiguredSize(),
                );
                collection.push(spec);
                await storeCollectionAsMemento(context, collection);
            } else {
                await createPetPlayground(context);
                await vscode.window.showInformationMessage(
                    vscode.l10n.t(
                        "A Pet Playground has been created. You can now use the 'Spawn Additional Pet' Command to add more pets.",
                    ),
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'vscode-pets.remove-all-pets',
            async () => {
                const panel = getPetPanel();
                if (panel !== undefined) {
                    panel.resetPets();
                    await storeCollectionAsMemento(context, []);
                } else {
                    await createPetPlayground(context);
                    await vscode.window.showInformationMessage(
                        vscode.l10n.t(
                            "A Pet Playground has been created. You can now use the 'Remove All Pets' Command to remove all pets.",
                        ),
                    );
                }
            },
        ),
    );

    // Listening to configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(
            (e: vscode.ConfigurationChangeEvent): void => {
                if (
                    e.affectsConfiguration('vscode-pets.petColor') ||
                    e.affectsConfiguration('vscode-pets.petType') ||
                    e.affectsConfiguration('vscode-pets.petSize') ||
                    e.affectsConfiguration('vscode-pets.theme') ||
                    e.affectsConfiguration('workbench.colorTheme')
                ) {
                    const spec = PetSpecification.fromConfiguration();
                    const panel = getPetPanel();
                    if (panel) {
                        panel.updatePetColor(spec.color);
                        panel.updatePetSize(spec.size);
                        panel.updatePetType(spec.type);
                        panel.updateTheme(
                            getConfiguredTheme(),
                            getConfiguredThemeKind(),
                        );
                        panel.update();
                    }
                }

                if (e.affectsConfiguration('vscode-pets.position')) {
                    void updateExtensionPositionContext();
                }

                if (e.affectsConfiguration('vscode-pets.throwBallWithMouse')) {
                    updatePanelThrowWithMouse();
                }
            },
        ),
    );

    if (vscode.window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        vscode.window.registerWebviewPanelSerializer(PetPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
                // Reset the webview options so we use latest uri for `localResourceRoots`.
                webviewPanel.webview.options = getWebviewOptions(
                    context.extensionUri,
                );
                const spec = PetSpecification.fromConfiguration();
                PetPanel.revive(
                    webviewPanel,
                    context.extensionUri,
                    spec.color,
                    spec.type,
                    spec.size,
                    getConfiguredTheme(),
                    getConfiguredThemeKind(),
                    getThrowWithMouseConfiguration(),
                );
            },
        });
    }
}

function updateStatusBar(): void {
    spawnPetStatusBar.text = `$(squirrel)`;
    spawnPetStatusBar.tooltip = vscode.l10n.t('Spawn Pet');
    spawnPetStatusBar.show();
}

export function spawnPetDeactivate() {
    spawnPetStatusBar.dispose();
}

function getWebviewOptions(
    extensionUri: vscode.Uri,
): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
        // Enable javascript in the webview
        enableScripts: true,
        // And restrict the webview to only loading content from our extension's `media` directory.
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    };
}

interface IPetPanel {
    throwBall(): void;
    resetPets(): void;
    spawnPet(spec: PetSpecification): void;
    deletePet(petName: string, petType: string, petColor: string): void;
    listPets(): void;
    rollCall(): void;
    themeKind(): vscode.ColorThemeKind;
    throwBallWithMouse(): boolean;
    updatePetColor(newColor: PetColor): void;
    updatePetType(newType: PetType): void;
    updatePetSize(newSize: PetSize): void;
    updateTheme(newTheme: Theme, themeKind: vscode.ColorThemeKind): void;
    updatePetStats(petName: string): void;
    listPets(): void;
    update(): void;
    setThrowWithMouse(newThrowWithMouse: boolean): void;
    //added
    showBackpack(): void;
    updateBackpack(foodCount: number): void;
    feedPet(petName: string): void;
    listPetsForFeeding(): void;
}

class PetWebviewContainer implements IPetPanel {
    protected _extensionUri: vscode.Uri;
    protected _disposables: vscode.Disposable[] = [];
    protected _petColor: PetColor;
    protected _petType: PetType;
    protected _petSize: PetSize;
    protected _theme: Theme;
    protected _themeKind: vscode.ColorThemeKind;
    protected _throwBallWithMouse: boolean;


    public listPetsForFeeding(): void {
        console.log('Sending list-pets-for-feeding message to webview');
        const webview = this.getWebview();
        webview.postMessage({
            command: 'list-pets-for-feeding'
        });
    }

    public showBackpack(): void {
        console.log('Sending show-backpack message to webview');
        const webview = this.getWebview();
        webview.postMessage({
            command: 'show-backpack'
        });
    }
    
    public updateBackpack(foodCount: number): void {
        console.log('Sending update-backpack message with food count:', foodCount);
        const webview = this.getWebview();
        webview.postMessage({
            command: 'update-backpack',
            foodCount: foodCount
        });
    }
    
    public feedPet(petName: string): void {
        console.log('feedPet called for:', petName);
        const pet = petCollection.locate(petName);
        if (pet) {
            console.log('Found pet to feed:', pet);
            pet.addExperience(5);
            console.log('Added experience, sending pet-fed message');

            this.getWebview().postMessage({
                command: 'pet-fed',
                petName: petName
            });
            this.updatePetStats(petName);
            this.updateBackpack(backpackState.foodCount);
        } else {
            console.log('Pet not found in collection for feeding:', petName);
        }
    }

    public updatePetStats(petName: string): void {
        void this.getWebview().postMessage({
            command: 'update-pet-stats',
            name: petName
        });
    }
    constructor(
        extensionUri: vscode.Uri,
        color: PetColor,
        type: PetType,
        size: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
        throwBallWithMouse: boolean,
    ) {
        this._extensionUri = extensionUri;
        this._petColor = color;
        this._petType = type;
        this._petSize = size;
        this._theme = theme;
        this._themeKind = themeKind;
        this._throwBallWithMouse = throwBallWithMouse;
    }

    public petColor(): PetColor {
        return normalizeColor(this._petColor, this._petType);
    }

    public petType(): PetType {
        return this._petType;
    }

    public petSize(): PetSize {
        return this._petSize;
    }

    public theme(): Theme {
        return this._theme;
    }

    public themeKind(): vscode.ColorThemeKind {
        return this._themeKind;
    }

    public throwBallWithMouse(): boolean {
        return this._throwBallWithMouse;
    }

    public updatePetColor(newColor: PetColor) {
        this._petColor = newColor;
    }

    public updatePetType(newType: PetType) {
        this._petType = newType;
    }

    public updatePetSize(newSize: PetSize) {
        this._petSize = newSize;
    }

    public updateTheme(newTheme: Theme, themeKind: vscode.ColorThemeKind) {
        this._theme = newTheme;
        this._themeKind = themeKind;
    }

    public setThrowWithMouse(newThrowWithMouse: boolean): void {
        this._throwBallWithMouse = newThrowWithMouse;
        void this.getWebview().postMessage({
            command: 'throw-with-mouse',
            enabled: newThrowWithMouse,
        });
    }

    public throwBall() {
        void this.getWebview().postMessage({
            command: 'throw-ball',
        });
    }

    public resetPets(): void {
        void this.getWebview().postMessage({
            command: 'reset-pet',
        });
    }

    public spawnPet(spec: PetSpecification) {
        void this.getWebview().postMessage({
            command: 'spawn-pet',
            type: spec.type,
            color: spec.color,
            name: spec.name,
        });
        void this.getWebview().postMessage({
            command: 'set-size',
            size: spec.size,
        });
    }

    public listPets() {
        void this.getWebview().postMessage({ command: 'list-pets' });
    }

    public rollCall(): void {
        void this.getWebview().postMessage({ command: 'roll-call' });
    }

    public deletePet(petName: string, petType: string, petColor: string) {
        void this.getWebview().postMessage({
            command: 'delete-pet',
            name: petName,
            type: petType,
            color: petColor,
        });
    }

    protected getWebview(): vscode.Webview {
        throw new Error('Not implemented');
    }

    protected _update() {
        const webview = this.getWebview();
        webview.html = this._getHtmlForWebview(webview);
    }

    public update() {}

    protected _getHtmlForWebview(webview: vscode.Webview) {
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(
            this._extensionUri,
            'media',
            'main-bundle.js',
        );

        // And the uri we use to load this script in the webview
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        // Local path to css styles
        const styleResetPath = vscode.Uri.joinPath(
            this._extensionUri,
            'media',
            'reset.css',
        );
        const stylesPathMainPath = vscode.Uri.joinPath(
            this._extensionUri,
            'media',
            'pets.css',
        );
        const silkScreenFontPath = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                'media',
                'Silkscreen-Regular.ttf',
            ),
        );

        // Uri to load styles into webview
        const stylesResetUri = webview.asWebviewUri(styleResetPath);
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

        // Get path to resource on disk
        const basePetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media'),
        );

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
                    webview.cspSource
                } 'nonce-${nonce}'; img-src ${
            webview.cspSource
        } https:; script-src 'nonce-${nonce}';
                font-src ${webview.cspSource};">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesResetUri}" rel="stylesheet" nonce="${nonce}">
                <link href="${stylesMainUri}" rel="stylesheet" nonce="${nonce}">
                <style nonce="${nonce}">
                    @font-face {
                        font-family: 'silkscreen';
                        src: url('${silkScreenFontPath}') format('truetype');
                    }
                    
                    /* Add experience bar styles */
                    .pet-exp-container {
                        position: absolute;
                        bottom: -20px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 40px;
                        background: rgba(0, 0, 0, 0.5);
                        border-radius: 4px;
                        padding: 2px;
                    }

                    .exp-bar {
                        width: 100%;
                        height: 4px;
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 2px;
                        overflow: hidden;
                    }

                    .exp-progress {
                        height: 100%;
                        background: #4CAF50;
                        transition: width 0.3s ease;
                    }

                    .exp-text {
                        color: white;
                        font-size: 8px;
                        text-align: center;
                        margin-bottom: 2px;
                    }

                    /* Make sure collision div can contain the exp bar */
                    .collision {
                        position: relative;
                    }
                </style>
                <title>VS Code Pets</title>
            </head>
            <body>
                <canvas id="petCanvas"></canvas>
                <div id="petsContainer"></div>
                <div id="foreground"></div>    
                <script nonce="${nonce}" src="${scriptUri}"></script>
                <script nonce="${nonce}">petApp.petPanelApp("${basePetUri}", "${this.theme()}", ${this.themeKind()}, "${this.petColor()}", "${this.petSize()}", "${this.petType()}", ${this.throwBallWithMouse()});</script>
            </body>
            </html>`;
    }
}

async function handleWebviewMessage(message: WebviewMessage) {
    switch (message.command) {
        case 'alert':
            await vscode.window.showErrorMessage(message.text);
            return;
        case 'info':
            await vscode.window.showInformationMessage(message.text);
            return;
        case 'unlock-achievement':
            if (achievementSystem && typeof message.achievementId === 'string') {
                console.log('Attempting to unlock achievement:', message.achievementId);
                await achievementSystem.unlockAchievement(message.achievementId);
                // Add debug logging after unlock
                console.log('Achievement unlocked and saved');
            }
            break;
        
        case 'update-achievement-progress':
            if (achievementSystem && 
                typeof message.achievementId === 'string' && 
                typeof message.progress === 'number') {
                console.log('Updating achievement progress:', message.achievementId, message.progress);
                await achievementSystem.updateProgress(message.achievementId, message.progress);
                // Add debug logging after update
                console.log('Achievement progress updated and saved');
            }
            break;
    }
}

/**
 * Manages pet coding webview panels
 */
class PetPanel extends PetWebviewContainer implements IPetPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: PetPanel | undefined;

    public static readonly viewType = 'petCoding';

    private readonly _panel: vscode.WebviewPanel;
    


    public static createOrShow(
        extensionUri: vscode.Uri,
        petColor: PetColor,
        petType: PetType,
        petSize: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
        throwBallWithMouse: boolean,
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        // If we already have a panel, show it.
        if (PetPanel.currentPanel) {
            if (
                petColor === PetPanel.currentPanel.petColor() &&
                petType === PetPanel.currentPanel.petType() &&
                petSize === PetPanel.currentPanel.petSize()
            ) {
                PetPanel.currentPanel._panel.reveal(column);
                return;
            } else {
                PetPanel.currentPanel.updatePetColor(petColor);
                PetPanel.currentPanel.updatePetType(petType);
                PetPanel.currentPanel.updatePetSize(petSize);
                PetPanel.currentPanel.update();
            }
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            PetPanel.viewType,
            vscode.l10n.t('Pet Panel'),
            vscode.ViewColumn.Two,
            getWebviewOptions(extensionUri),
        );

        PetPanel.currentPanel = new PetPanel(
            panel,
            extensionUri,
            petColor,
            petType,
            petSize,
            theme,
            themeKind,
            throwBallWithMouse,
        );
    }

    public resetPets() {
        void this.getWebview().postMessage({ command: 'reset-pet' });
    }

    public listPets() {
        void this.getWebview().postMessage({ command: 'list-pets' });
    }

    public rollCall(): void {
        void this.getWebview().postMessage({ command: 'roll-call' });
    }

    public deletePet(petName: string, petType: string, petColor: string): void {
        void this.getWebview().postMessage({
            command: 'delete-pet',
            name: petName,
            type: petType,
            color: petColor,
        });
    }

    public static revive(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        petColor: PetColor,
        petType: PetType,
        petSize: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
        throwBallWithMouse: boolean,
    ) {
        PetPanel.currentPanel = new PetPanel(
            panel,
            extensionUri,
            petColor,
            petType,
            petSize,
            theme,
            themeKind,
            throwBallWithMouse,
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        color: PetColor,
        type: PetType,
        size: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
        throwBallWithMouse: boolean,
    ) {
        super(
            extensionUri,
            color,
            type,
            size,
            theme,
            themeKind,
            throwBallWithMouse,
        );

        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            () => {
                this.update();
            },
            null,
            this._disposables,
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                await handleWebviewMessage(message);
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        PetPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public update() {
        if (this._panel.visible) {
            this._update();
        }
    }

    getWebview(): vscode.Webview {
        return this._panel.webview;
    }
}

class PetWebviewViewProvider extends PetWebviewContainer {
    public static readonly viewType = 'petsView';
    private _webviewView?: vscode.WebviewView;
    public onReady: ((webview: vscode.Webview) => void) | undefined;

    resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
        this._webviewView = webviewView;

        webviewView.webview.options = getWebviewOptions(this._extensionUri);
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                await handleWebviewMessage(message);
            },
            null,
            this._disposables
        );
        if (this.onReady) {
            this.onReady(webviewView.webview);
        }
    }

    update() {
        this._update();
    }

    getWebview(): vscode.Webview {
        if (this._webviewView === undefined) {
            throw new Error(
                vscode.l10n.t(
                    'Panel not active, make sure the pets view is visible before running this command.',
                ),
            );
        } else {
            return this._webviewView.webview;
        }
    }
}

function getNonce() {
    let text = '';
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function createPetPlayground(context: vscode.ExtensionContext) {
    const spec = PetSpecification.fromConfiguration();
    PetPanel.createOrShow(
        context.extensionUri,
        spec.color,
        spec.type,
        spec.size,
        getConfiguredTheme(),
        getConfiguredThemeKind(),
        getThrowWithMouseConfiguration(),
    );
    if (PetPanel.currentPanel) {
        var collection = PetSpecification.collectionFromMemento(
            context,
            getConfiguredSize(),
        );
        collection.forEach((item) => {
            PetPanel.currentPanel?.spawnPet(item);
        });
        await storeCollectionAsMemento(context, collection);
    } else {
        var collection = PetSpecification.collectionFromMemento(
            context,
            getConfiguredSize(),
        );
        collection.push(spec);
        await storeCollectionAsMemento(context, collection);
    }
}