onload = async () => {
    const info = document.getElementById('info');
    const buttons = document.getElementById('buttons');
    const openLink = /** @type {HTMLLinkElement} */(document.getElementById('openLink'));
    const openPopUp = /** @type {HTMLButtonElement} */(document.getElementById('openPopUp'));
    function revealButtons(theiaLocation) {
        openLink.href = theiaLocation;
        openPopUp.onclick = () => {
            open(theiaLocation, '_blank', 'popup');
        };
        buttons.style.display = '';
    }
    const res = await fetch('./status');
    if (res.status === 401) {
        info.style.color = '#700';
        location.href = '/';
    } else if (res.status === 200) {
        const theiaLocation = await res.text();
        info.innerText = 'Theia Workspace is ready!';
        revealButtons(theiaLocation);
    } else {
        info.style.color = '#700';
        info.innerText = 'Something went wrong, please reload the page...';
    }
}
