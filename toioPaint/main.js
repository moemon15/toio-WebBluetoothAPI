// Get the local storage keys
const localStorageKeys = Object.keys(localStorage);

// Get the UL element to display the keys
const ulElement = document.getElementById('localStorageKeys');

// Function to toggle the display of details
function toggleDetails(event) {
    const detailsElement = event.currentTarget.nextElementSibling;
    if (detailsElement.style.display === 'none') {
        detailsElement.style.display = 'block';
    } else {
        detailsElement.style.display = 'none';
    }
}

// Loop through the local storage keys and create list items with details
localStorageKeys.forEach(key => {
    const liElement = document.createElement('li');
    liElement.textContent = key;
    liElement.addEventListener('click', toggleDetails);

    const detailsElement = document.createElement('div');
    detailsElement.className = 'details';
    detailsElement.textContent = `${key}: ${localStorage.getItem(key)}`;

    ulElement.appendChild(liElement);
    ulElement.appendChild(detailsElement);
});