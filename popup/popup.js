let taggingProjects;
const defaultTaggingProjects ={taggingProjects:[],
                       queue: {isactive:true,content:[]},
                       workflow:1,
                       variantCriteria:false,
                       projectChaining:false
                      }; //default on first time use of extension should be workflow 1 w/ queue
//So we run 1 Dom query instead of everytime its clicked
const currentProjects = document.getElementById('current-projects');
const settingsButton = document.getElementById('settings-button');
const queue = document.getElementById('queue');
const queueCompress = document.getElementById('compress');
const queueCount = document.getElementById('queue-count');
const requestBulk = document.getElementById('request-bulk'); //separation for simple scrolling through only changes, easy access to 
const submit = document.getElementById('submit');
const STORAGE_KEY = 'taggingProjects';
let queueSubmitting = false; //this only allows a single concurrent queue processor
//functions
// save data to browser
async function saveList(list) {
    await browser.storage.local.set({[STORAGE_KEY]: list});
}
//initialize data
async function initialize(){
    console.log('Loading extension data...');
    const result = await browser.storage.local.get(STORAGE_KEY);

    if(!result[STORAGE_KEY]){//first time use handler
        console.log('First time using extension.');

        taggingProjects = structuredClone(defaultTaggingProjects);
        await saveList(taggingProjects);
    }else{
        taggingProjects = result[STORAGE_KEY];
    }
    console.log('Loaded:', JSON.stringify(taggingProjects));

    //initialize UI
    for (let project of taggingProjects.taggingProjects){
        //wrapper
        const projectX = document.createElement('div');
        projectX.classList.add('project');
        projectX._project = project;

        const addCriteria = document.createElement('button');
        addCriteria.style = 'grid-column: 2 / 3; grid-row: 1 / 2;width: 2rem; height: 100%;';
        addCriteria.innerText = '+';

        addCriteria.addEventListener('click', async () => {
            console.log(projectX._project.tagprojectCriteria)
            //template logic should essentially search with specified tag logic so that ONLY posts that dont have the options changes show up
            if(projectX._project.template){
                appendCriteria(generateTemplateSearchQuery(projectX._project));
            }else{
                appendCriteria(projectX._project.tagprojectCriteria);
            }
        });
        //Multi-option checkbox, placed before buttonX event listener so its initialized properly
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.classList.add('checkbox-wrapper');
        checkboxWrapper.style = 'justify-content:center;grid-column: 1 / 3; grid-row: 2 / 3;flex-basis: 100%;';

        const multiOptionCheckbox = document.createElement('input');
        multiOptionCheckbox.type = 'checkbox';
        multiOptionCheckbox.id = `multi-option-${project.tagprojectName}`;

        // Create label
        const multiOptionLabel = document.createElement('label');
        multiOptionLabel.innerText = 'multi-option';
        // Associate label with checkbox
        multiOptionLabel.htmlFor = `multi-option-${project.tagprojectName}`;

        checkboxWrapper.append(multiOptionCheckbox,multiOptionLabel);

        const buttonX = document.createElement('button');
        buttonX.style = 'grid-column: 1 / 2; grid-row: 1 / 2; overflow-wrap: break-word; word-break: break-word;';
        buttonX.innerText = project.tagprojectName;
        //event listener for button
        buttonX.addEventListener('click', () => {
            const toggled = buttonX.classList.toggle("focus")
            if (toggled){
                console.log(multiOptionCheckbox.checked);
                multiOptionCheckbox.checked ? highlightPosts(projectX._project,true) : highlightPosts(projectX._project,false);
            } else {//TODO remove the toggle, replace with a "clear highlights" option
                clearHighlights();
            } 
        });

        projectX.append(buttonX);
        projectX.append(addCriteria);
        projectX.append(checkboxWrapper);
        currentProjects.append(projectX);        
    }
    //Queue
    if(taggingProjects.queue.isactive && taggingProjects.queue.content.length > 0){
        displayQueue();
    }
}
//Template criteria formatting, Heavy uses of the bracketting system on e621
function generateTemplateSearchQuery(project) {
    const criteria = project.tagprojectCriteria || '';
    const queryParts = [criteria];
    for (const option of project.options) {
        //Split by whitespace to handle multi-tag changes
        const tags = option.change.trim().split(/\s+/);
        for (const tag of tags) {
            if (tag) {
                //Remove any existing prefix if present, then apply the negative group standard
                const cleanTag = tag.startsWith('-') ? tag.slice(1) : tag;
                queryParts.push(`~( -${cleanTag} )`);
            }
        }
    }
    return queryParts.join(" ");
}

function displayQueue(){ //request format should be object {type:'change', postnum:1234, Change:"example"}
    //for the actual display
    queue.style.display = 'grid';
    //establishing queue
    let requests = taggingProjects.queue.content;
    // Separate refresh from everything else
    const refresh = requests.find(item => item.type === 'refresh');
    const nonRefreshItems = requests.filter(item => item.type !== 'refresh');
    //change count
    queueCount.innerText = 'Current Queue: ' + nonRefreshItems.length + ' change(s)'
    // If there's no refresh and exactly one other item, add one
    if (!refresh) {
        nonRefreshItems.push({type:'refresh'});
        taggingProjects.queue.content = nonRefreshItems;
        saveList(taggingProjects);
    } else if(refresh) {// If a refresh exists, it must be the ONLY refresh and LAST item
        taggingProjects.queue.content = [...nonRefreshItems, refresh];
        saveList(taggingProjects);
    }
    //reestablish queue if a refresh was added or reorganized
    requests = taggingProjects.queue.content;
    console.log(JSON.stringify(requests));
    //creating the elements for queue
    for (let request of requests){
        createQueueElement(request);
    }
}

async function queueRemove(request) {
    taggingProjects.queue.content = taggingProjects.queue.content.filter(item => item !== request);
    queueCount.innerText = 'Current Queue: ' + taggingProjects.queue.content.filter(item => item.type !== 'refresh').length + ' change(s)' //TODO make this a standalone function
    await saveList(taggingProjects);
}

function createQueueElement(request){
    console.log(JSON.stringify(request));
    //will comprise of 2 elements
    //main container
    let queueX = document.createElement('div'); //TODO give this its own CSS class
    queueX.style.display = 'flex';
    queueX._request = request;
    //info text container
    let queuexInfo = document.createElement('div');
    queuexInfo.style = 'display:flex;flex-flow:column;width:9rem;maxHeight:3 rem;overflow-x:scroll';
    queueX.append(queuexInfo);
    //request title
    let requestText = document.createElement('label');
    queuexInfo.append(requestText);
    
    let queuexDelete = document.createElement('button'); //TODO make this into a CSS class for buttons
    queuexDelete.textContent = 'X';
    queuexDelete.style = 'height:2rem;width:2rem';
    queuexDelete.classList.add('deletetype');
    queuexDelete.addEventListener('click', async () => {
        await queueRemove(queueX._request);
        console.log(JSON.stringify(taggingProjects.queue.content));
        removeQueueElement(queueX._request);
    }); 
    queueX.append(queuexDelete);
    //type triggers
    if (request.type === 'refresh'){
        requestText.textContent = 'page refresh';
        //refresh should always be at the end, visable at all times along with submit
        queue.insertBefore(queueX,submit);
    }else{//should only be type:'change'
        requestText.textContent = request.type + ' post#: ' + request.postnum;
        let tags = [...request.change.split(' ')];
        for (let tag of tags){
            let tagText = document.createElement('label');
            tagText.textContent = tag;
            queuexInfo.append(tagText);
        }
        //change requests go to request bulk that can be scrolled through.
        requestBulk.append(queueX);
    }
}

function removeQueueElement(request) {
    let type = request.type === 'refresh' ? queue : requestBulk;
    //if its a refresh, it will loop through Queue, if its a change it will loop through request bulk 
    for (const element of type.children) {
        if (element._request === request) {
            queueCount.innerText = 'Current Queue: ' + taggingProjects.queue.content.filter(item => item.type !== 'refresh').length + ' change(s)'
            element.remove();
            return;
        }
    }
}

function compressQueue(queue){
    const compressed = [];
    const changesByPost = new Map();

    for(let request of queue){
        //destroying all active elements TODO recreate function to be more efficient
        removeQueueElement(request);
        if(request.type === 'change'){
            if (changesByPost.has(request.postnum)) {
                changesByPost.get(request.postnum).change += ' ' + request.change; //TODO make quality assurance of spaces only being between two tags.
            } else {
                const newRequest = {
                    type:'change',
                    postnum:request.postnum,
                    change:request.change
                };
                changesByPost.set(request.postnum, newRequest);
                compressed.push(newRequest);
            }
        }else{//if to else because request should always be last
            compressed.push(request)
        }
    }
    //recreating all active elements
    for (let request of compressed){
        createQueueElement(request);
    }
    queueCount.innerText = 'Current Queue: ' + compressed.filter(item => item.type !== 'refresh').length + ' change(s)'
    taggingProjects.queue.content = compressed;
    saveList(taggingProjects);
}

async function sendRequest(request) {
    try {
        if (request.type === 'refresh') {
            await refreshCurrentPage();
        } else if (request.type === 'change') {
            const result = await sendChange({
                postnum: request.postnum,
                change: request.change,
              projectName: request.projectName
            });

            console.log('Change finished:', result);
        } else {
            throw new Error(`Unknown queue request type: ${request.type}`);
        }

        await queueRemove(request);
        removeQueueElement(request);

        return true;
    } catch (error) {
        console.error('Queue request failed:', request, error);
        return false;
    }
}

async function getActiveTab(){
    const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab || !tab.id || !tab.url) {
        return null;
    }
    try {
        const url = new URL(tab.url);
        //Non-e621 page detection
        if (url.hostname !== 'e621.net') {
            return null;
        }
    } catch (error) {
        console.error('Could not determine active tab URL:', error);
        return null;
    }

    return tab;
}

async function sendToContentScript(message) {
    const tab = await getActiveTab();

    if (!tab) {
        throw new Error('The active tab is not an e621 page.');
    }

    try {
        return await browser.tabs.sendMessage(tab.id, message);
    } catch (error) {
        throw new Error('Could not communicate with e621 page:', error);
    }
}

async function refreshCurrentPage() {
    const tab = await getActiveTab();

    if (tab) {
        await browser.tabs.reload(tab.id);
    }
}

async function highlightPosts(project, allowMultiple) {
    return sendToContentScript({
        action: 'highlightPost',
        project,
        allowMultiple
    });
}

async function clearHighlights() {
    return sendToContentScript({
        action: 'clearHighlights'
    });
}

async function sendChange(change, projectName) {
    return sendToContentScript({
        action: 'sendChange',
        change
    });
}

async function appendCriteria(criteria) {
    return sendToContentScript({
        action: 'appendCriteria',
        criteria
    });
}

//event listeners (Extensions forbid onclick)
settingsButton.addEventListener('click', function (){ //event listener will fill first parameter if function called directly
    browser.tabs.create({
        url: browser.runtime.getURL('../settings/settings.html')
    });
});
queueCompress.addEventListener('click', function (){ 
    const requests = [...taggingProjects.queue.content];
    compressQueue(requests);
});
//queue submit
submit.addEventListener('click', async function () {
    if (queueSubmitting) {
        return;
    }
    queueSubmitting = true;
    submit.disabled = true;
    try {
        const requests = [...taggingProjects.queue.content];
        for (const request of requests) {
            const success = await sendRequest(request);
            if (!success) {
                break;
            }
        }
        if (taggingProjects.queue.content.length === 0) {
            queue.style.display = 'none';
        }
    } finally {
        queueSubmitting = false;
        submit.disabled = false;
    }
});
initialize();
