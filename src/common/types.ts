export const enum PetColor {
    brown = 'brown',
    lightbrown = 'lightbrown',
    black = 'black',
    green = 'green',
    yellow = 'yellow',
    gray = 'gray',
    purple = 'purple',
    red = 'red',
    white = 'white',
    orange = 'orange',
    akita = 'akita',
    socksblack = 'socks black',
    socksbeige = 'socks beige',
    socksbrown = 'socks brown',
    paintbeige = 'paint beige',
    paintblack = 'paint black',
    paintbrown = 'paint brown',
    magical = 'magical',
    warrior = 'warrior',
    null = 'null',
}

export const enum PetType {
    cat = 'cat',
    chicken = 'chicken',
    clippy = 'clippy',
    cockatiel = 'cockatiel',
    crab = 'crab',
    dog = 'dog',
    deno = 'deno',
    fox = 'fox',
    horse = 'horse',
    mod = 'mod',
    rat = 'rat',
    rocky = 'rocky',
    rubberduck = 'rubber-duck',
    snail = 'snail',
    snake = 'snake',
    totoro = 'totoro',
    turtle = 'turtle',
    zappy = 'zappy',
    null = 'null',
}

export const enum PetSpeed {
    still = 0,
    verySlow = 1,
    slow = 2,
    normal = 3,
    fast = 4,
    veryFast = 5,
}

export const enum PetSize {
    nano = 'nano',
    small = 'small',
    medium = 'medium',
    large = 'large',
}

export const enum ExtPosition {
    panel = 'panel',
    explorer = 'explorer',
}

export const enum Theme {
    none = 'none',
    forest = 'forest',
    castle = 'castle',
    beach = 'beach',
}

export const enum ColorThemeKind {
    light = 1,
    dark = 2,
    highContrast = 3,
}

export interface PetStats {
    level: number;
    experience: number;
}

export interface BackpackState {
    foodCount: number;
}

export class WebviewMessage {
    text!: string;
    command: string;
    achievementId?: string;
    progress?: number;
    petId?: string;
    amount?: number;
    name?: string;
    // Add new properties
    petName?: string;
    petStats?: PetStats;
    foodCount?: number;
    backpackOperation?: 'show' | 'feed';
    currentFood?: number;

    constructor(command: string, text?: string, achievementId?: string, progress?: number) {

        this.command = command;        
        if (text) {
            this.text = text;
        }
        this.achievementId = achievementId;
        this.progress = progress;
    }
}

export const ALL_PETS = [
    PetType.cat,
    PetType.chicken,
    PetType.clippy,
    PetType.cockatiel,
    PetType.crab,
    PetType.dog,
    PetType.deno,
    PetType.fox,
    PetType.horse,
    PetType.mod,
    PetType.rat,
    PetType.rocky,
    PetType.rubberduck,
    PetType.snail,
    PetType.snake,
    PetType.totoro,
    PetType.turtle,
    PetType.zappy,
];
export const ALL_COLORS = [
    PetColor.black,
    PetColor.brown,
    PetColor.lightbrown,
    PetColor.green,
    PetColor.yellow,
    PetColor.gray,
    PetColor.purple,
    PetColor.red,
    PetColor.white,
    PetColor.orange,
    PetColor.akita,
    PetColor.socksblack,
    PetColor.socksbeige,
    PetColor.socksbrown,
    PetColor.paintbeige,
    PetColor.paintblack,
    PetColor.paintbrown,
    PetColor.magical,
    PetColor.warrior,
    PetColor.null,
];
export const ALL_SCALES = [
    PetSize.nano,
    PetSize.small,
    PetSize.medium,
    PetSize.large,
];
export const ALL_THEMES = [Theme.none, Theme.forest, Theme.castle, Theme.beach];
