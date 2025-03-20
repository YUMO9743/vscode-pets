import React from 'react';

interface BackpackProps {
    isOpen: boolean;
    onClose: () => void;
    foodCount: number;
    onFeed: (petName: string) => void;
    pets: Array<{name: string; type: string; color: string}>;
}

const Backpack = ({ isOpen, onClose, foodCount, onFeed, pets }: BackpackProps) => {
    if (!isOpen) {return null;}

    return (
        <div className="backpack-modal">
            <div className="backpack-content">
                <div className="backpack-header">
                    <h2>Backpack 🎒</h2>
                    <button onClick={onClose} className="close-button">×</button>
                </div>
                
                <div className="backpack-body">
                    <div className="food-section">
                        <h3>Food Items</h3>
                        <p>🍖 Food: {foodCount}</p>
                    </div>
                    
                    {foodCount > 0 && pets.length > 0 && (
                        <div className="pets-section">
                            <h3>Feed a Pet</h3>
                            <div className="pet-list">
                                {pets.map((pet) => (
                                    <button 
                                        key={pet.name}
                                        onClick={() => onFeed(pet.name)}
                                        className="feed-button"
                                    >
                                        Feed {pet.name} ({pet.color} {pet.type})
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {foodCount === 0 && (
                        <p className="no-food">No food items available!</p>
                    )}
                    
                    {pets.length === 0 && (
                        <p className="no-pets">No pets to feed!</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Backpack;