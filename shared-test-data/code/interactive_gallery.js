// Interactive Gallery Script - Small Version

class PhotoGallery {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentIndex = 0;
        this.images = [
            'sunset.jpg',
            'mountain.jpg', 
            'ocean.jpg',
            'forest.jpg'
        ];
        this.init();
    }
    
    init() {
        this.createGallery();
        this.bindEvents();
    }
    
    createGallery() {
        const galleryHTML = `
            <div class="gallery-container">
                <img id="current-image" src="${this.images[0]}" alt="Gallery Image">
                <div class="controls">
                    <button id="prev-btn">← Previous</button>
                    <button id="next-btn">Next →</button>
                </div>
            </div>
        `;
        this.container.innerHTML = galleryHTML;
    }
    
    bindEvents() {
        document.getElementById('prev-btn').addEventListener('click', () => this.prevImage());
        document.getElementById('next-btn').addEventListener('click', () => this.nextImage());
    }
    
    nextImage() {
        this.currentIndex = (this.currentIndex + 1) % this.images.length;
        this.updateImage();
    }
    
    prevImage() {
        this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
        this.updateImage();
    }
    
    updateImage() {
        document.getElementById('current-image').src = this.images[this.currentIndex];
    }
}

// Initialize gallery when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PhotoGallery('gallery');
});
