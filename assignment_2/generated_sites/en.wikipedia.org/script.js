document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggle = document.querySelector('.sidebar-toggle-button');
    const sidebar = document.getElementById('mw-panel');
    const contentContainer = document.getElementById('mw-content-container');

    if (sidebarToggle && sidebar && contentContainer) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            // Optional: Adjust content container margin when sidebar is active/inactive on smaller screens
            if (window.innerWidth < 768) {
                if (sidebar.classList.contains('active')) {
                    contentContainer.style.marginLeft = '160px'; // Match sidebar width
                } else {
                    contentContainer.style.marginLeft = '0';
                }
            }
        });

        // Close sidebar if window is resized above mobile breakpoint while sidebar is open
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768) {
                sidebar.classList.remove('active');
                contentContainer.style.marginLeft = ''; // Reset margin
            } else {
                // Reapply margin if sidebar is active on resize within mobile breakpoint
                if (sidebar.classList.contains('active')) {
                    contentContainer.style.marginLeft = '160px';
                } else {
                    contentContainer.style.marginLeft = '0';
                }
            }
        });
    }

    // Placeholder for dynamic article count from design brief
    const articleCountElement = document.getElementById('article-count');
    if (articleCountElement) {
        // This could be fetched dynamically or parsed from design-brief.json
        // For now, it's hardcoded in HTML, but here's where JS would update it.
        // Example: articleCountElement.textContent = '7,178,585';
    }
});