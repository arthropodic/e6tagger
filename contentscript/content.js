//TODO make the site interactions cross extension compatable by replacing all site articles with post elements, then create the post elements through the content script.
const STORAGE_KEY = 'taggingProjects';
let taggingProjects;
const requestQueue = new TaskQueue();
//whats to be displayed
const postProjects = new WeakMap();
//project chaining
const selectedProjects = new Set();
//project chaining + queue
const simulatedTags = new WeakMap();
const completedProjects = new WeakMap();
//Zoom container + options
let zoomContainer,iFrame, zoomOptions;
let activePost = null;
//zoom purpose assurance
let zoomHideTimer = null;
//save data
async function saveList(list) {
    await browser.storage.local.set({
        [STORAGE_KEY]: list
    });
}
//load data + blank data(first time load) catch
async function loadBrowserData() {
    //await browser.storage.local.remove(STORAGE_KEY);
    console.log("loading extension data from storage...")
    const result = await browser.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY];
}
//Add criteria to search
function appendCriteria(criteria){
    const textarea = document.querySelector("textarea[name='tags']");
    const searchButton = document.querySelector('button[type="submit"][title="Search"]');
    const current = textarea.value.trim();

    textarea.value = current ? `${current} ${criteria}` : criteria;

    searchButton.click();
}
//contact to e621
async function postChange(postId, change, projectName) {
    const authToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!authToken) {
        throw new Error('Could not find CSRF token, not logged in');
    }
    const body = new URLSearchParams({
        'post[tag_string_diff]': change,
        'post[edit_reason]': `Using Tagging Project: ${projectName}`,
        authenticity_token: authToken
    });

    const agent = new URLSearchParams({
        _client: 'e6tagger/0.3 (by arthropodic)'
    });

    const response = await fetch(
        `https://e621.net/posts/${postId}.json?${agent}`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type':
                    'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body
        }
    );
    //failure detection
    if (!response.ok) {
        throw new Error(`e621 returned ${response.status} ${response.statusText}`);
    }
    const data = await response.json();

    console.log('Change completed:', data);

    return data;
}

function centerOn(post) {
    const postRect = post.getBoundingClientRect();
    const content = document.querySelector('.content');
    if (!content) {
        console.error('Could not find .content');
        return;
    }
    const contentRect = content.getBoundingClientRect();
    //Center zoomContainer on the post
    let x =
        postRect.left +
        postRect.width / 2 -
        zoomContainer.offsetWidth / 2;

    let y =
        postRect.top +
        postRect.height / 2 -
        zoomContainer.offsetHeight / 2;
    //Keep the zoomContainer completely inside .content
    const minX = contentRect.left;
    const maxX = contentRect.right - zoomContainer.offsetWidth;

    const minY = contentRect.top;
    const maxY = contentRect.bottom - zoomContainer.offsetHeight;

    x = Math.max(minX, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));


    zoomContainer.style.left = `${x}px`;
    zoomContainer.style.top = `${y}px`;
    zoomContainer.style.display = 'flex';
}

function getPostElements() {//TODO depreciated, adapt to new zoomContainer model
    return [
    ...document.querySelectorAll('article.thumbnail'),//vanilla
    ...document.querySelectorAll('post')//re621
    ];
}

function scheduleHideZoom() {
    clearTimeout(zoomHideTimer);
    zoomHideTimer = setTimeout(() => {
        hideZoomContainer();
    }, 100);
}
function cancelHideZoom() {
    clearTimeout(zoomHideTimer);
}

// add/delete posts with 'getPostProjects(post).add(project)' or 'getPostProjects(post).delete(project)' or simply 'getPostProjects(post).size'
function getPostProjects(post) {
    if (!postProjects.has(post)) {
        postProjects.set(post, new Map());
    }
    return postProjects.get(post);
}
//For specific posts
function removePostProject(post, projectName) {
    const projects = getPostProjects(post);
    projects.delete(projectName);
}

function getCompletedProjects(post) {
    if (!completedProjects.has(post)) {
        completedProjects.set(
            post,
            new Set()
        );
    }

    return completedProjects.get(post);
}

function finishPost(post) {
    removeMouseHandlers(post);
    post.classList.remove('highlighted-post');
    postProjects.delete(post);
    simulatedTags.delete(post);
    completedProjects.delete(post);
    if (activePost === post) {
        hideZoomContainer();
        activePost = null;
    }
}
//re621 detection
function isRe621Post(post) {
    return post.tagName.toLowerCase() === 'post';
}
//TODO add gif/mp4/webm integration
function loadSampleImage(sampleUrl) {
    return new Promise((resolve, reject) => {
        // Load the sample
        iFrame.onload = () => {
            console.log('Sample iframe loaded:', sampleUrl);
            resolve();
        };
        iFrame.onerror = () => {
            reject(new Error(`Failed to load sample: ${sampleUrl}`));
        };
        iFrame.src = sampleUrl;
    });
}
//if post is blacklisted. Haven't seen a non true blacklisted state for re621.
function isBlacklistedPost(post) {
        return (
        post.classList.contains('blacklisted') ||
        post.hasAttribute('blacklisted')
    );
}
//adapter between re621 and vanilla e621
function getPostData(post) {
    if (isRe621Post(post)) {
        return {
            element: post,
            id: post.dataset.id,
            tags: post.dataset.tags ?? '',
            sampleUrl: post.dataset.sampleUrl,
            image: post.querySelector('img'),
        };
    }

    return {
        element: post,
        id: post.dataset.id,
        tags: post.dataset.tags ?? '',
        sampleUrl: post.dataset.sampleUrl,
        image: post.querySelector('picture img'),
    };
}

function hideZoomContainer() {
    zoomContainer.style.display = 'none';

    zoomOptions.replaceChildren();
    zoomOptions.style.display = 'none';

    activePost = null;
}

function createOptionsArea(post, project, allowMultiple) {
    const optionsArea = document.createElement('div');
    optionsArea.classList.add('options-area');
    optionsArea.dataset.project = project.tagprojectName;

    const selectedOptions = new Set();

    for (const option of project.options) {
        const optionX = document.createElement('button');

        optionX.classList.add('option');
        optionX.innerText = option.option;

        optionX.addEventListener('click', async () => {
            if (allowMultiple) {
                optionX.classList.toggle('focus');

                if (optionX.classList.contains('focus')) {
                    selectedOptions.add(option.change);
                } else {
                    selectedOptions.delete(option.change);
                }
            return;
            }
            await processProjectChange(
                post,
                project,
                option.change,
                allowMultiple
            );
        });
        optionsArea.append(optionX);
    }

    if (allowMultiple) {
        const submitOption = document.createElement('button');

        submitOption.classList.add('option');
        submitOption.style.flexBasis = '100%';
        submitOption.innerText = 'Submit';

        submitOption.addEventListener('click', async () => {
            if (selectedOptions.size === 0) {
                return;
            }

            const combinedChange = [...selectedOptions].join(' ');

            await processProjectChange(
                post,
                project,
                combinedChange,
                allowMultiple
            );
        });
        optionsArea.append(submitOption);
    }
    return optionsArea;
}

function renderZoomOptions(post, allowMultiple) {
    zoomOptions.replaceChildren();
    const projects = getPostProjects(post);
    if (projects.size === 0) {
        zoomOptions.style.display = 'none';
        return;
    }
    for (const project of projects.values()) {
        const optionsArea = createOptionsArea(
            post,
            project,
            allowMultiple
        );
        zoomOptions.append(optionsArea);
    }
    zoomOptions.style.display = 'flex';
}

async function processProjectChange(post, project, change, allowMultiple){
    console.log(post.dataset.id,change,project.tagprojectName);

    if (taggingProjects.queue.isactive){
        taggingProjects.queue.content.push({
            type: 'change',
            postnum: post.dataset.id,
            change,
            projectName: project.tagprojectName
        });
        await saveList(taggingProjects);
    } else {
        await postChange(
            post.dataset.id,
            change,
            project.tagprojectName
        );
    }
    //Mark this project as completed
    removePostProject(post, project.tagprojectName);
    getCompletedProjects(post).add(project.tagprojectName);

    //Project chaining
    if (taggingProjects.projectChaining) {
        const currentTags = getCurrentTags(post);

        const newTags = applyChangeToTags(currentTags, change);

        simulatedTags.set(post, newTags);

        updatePostProjects(
            post,
            newTags,
            allowMultiple
        );
    }else{
        renderZoomOptions(post, allowMultiple);
    }

    //Nothing left to do
    if (getPostProjects(post).size === 0) {
        finishPost(post);
    }
}

function addMouseEnterHandler(post, allowMultiple) {
    const mouseEnterHandler = async () => {
        const projects = getPostProjects(post);

        if (projects.size === 0) {
            return;
        }
        cancelHideZoom();
        activePost = post;
        await loadSampleImage(post.dataset.sampleUrl);
        if (getPostProjects(post).size === 0) {//The post might have been completed while the image was loading
            return;
        }
        renderZoomOptions(post, allowMultiple);
        requestAnimationFrame(() => {
            centerOn(post);
        });
    };

    const mouseLeaveHandler = () => {
        scheduleHideZoom();
    };
    post._mouseEnterHandler = mouseEnterHandler;
    post._mouseLeaveHandler = mouseLeaveHandler;
    post.addEventListener('mouseenter', mouseEnterHandler);
    post.addEventListener('mouseleave', mouseLeaveHandler);
}

function removeMouseHandlers(post) {
    if (post._mouseEnterHandler){
        post.removeEventListener('mouseenter',post._mouseEnterHandler);
        delete post._mouseEnterHandler;
    }
    if (post._mouseLeaveHandler){
        post.removeEventListener('mouseleave',post._mouseLeaveHandler);
        delete post._mouseLeaveHandler;
    }
}
// parses tags into an array with two attributes, whitelist & blacklist. Removes duplicates, warns for conflicting tags across whitelist & blacklist.
function parseTags(unfiltered) {
  return unfiltered
    .trim()
    .split(/\s+/)
    .reduce((result, tag) => {
      const key = tag.startsWith('-') ? 'blacklist' : 'whitelist';
      const opposite = key === 'whitelist' ? 'blacklist' : 'whitelist';
      const value = tag.startsWith("-") ? tag.slice(1) : tag;

      result[opposite].includes(value)
        ? console.log(`Tag confliction: ${value}`)
        : result[key].includes(value) || result[key].push(value);

      return result;
    }, { whitelist: [], blacklist: [] });
}
//criteria matching, accepts tags as a set
function matchesCriteria(tags, criteria){ 
    return (
        criteria.whitelist.every(tag => tags.has(tag)) &&
        criteria.blacklist.every(tag => !tags.has(tag))
    );
}
//Project chaining intracacy, setup to allow MULTIPLE changes to set a post to allow another active tagging project to match criteria.
function getCurrentTags(post) {
    if (!simulatedTags.has(post)) {
        simulatedTags.set(post, new Set(parseTags(post.dataset.tags ?? '').whitelist));
    }
    return simulatedTags.get(post);
}
//temp placing changes for project chaining
function applyChangeToTags(currentTags, change) {
    const tags = new Set(currentTags);
    const parsedChange = parseTags(change);

    parsedChange.whitelist.forEach(tag => tags.add(tag));
    parsedChange.blacklist.forEach(tag => tags.delete(tag));

    return tags;
}
//project chaining adding post to project
function updatePostProjects(post, tags, allowMultiple) {
    const projects = getPostProjects(post);
    const completed = getCompletedProjects(post);

    for (const project of selectedProjects) {
        const projectName = project.tagprojectName;
        if (projects.has(projectName)) continue; // Already present
        if (completed.has(projectName)) continue;
        const criteria = parseTags(project.tagprojectCriteria);

        if (!matchesCriteria(tags, criteria)) continue;

        const validOptions = getValidOptions(project, tags);

        if (validOptions.length === 0) continue;
        
        const filteredProject = {...project, options: validOptions};

        projects.set(projectName, filteredProject);
    }
    renderZoomOptions(post, allowMultiple);
}

function getValidOptions(project, tags) {
    if (!project.template) {
        return project.options;
    }

    const validOptions = [];

    for (const option of project.options) {
        const parsedChange = parseTags(option.change);
        const hasAllWhitelist = parsedChange.whitelist.every(tag => tags.has(tag));
        const hasAllBlacklist = parsedChange.blacklist.every(tag => !tags.has(tag));

        const needsFix = !hasAllWhitelist || !hasAllBlacklist;

        if (needsFix) {
            validOptions.push(option);
        }
    }
    return validOptions;
}
//highlightposts
function highlightPosts(project, allowMultiple) {
    selectedProjects.add(project);
    const projectCriteria = parseTags(project.tagprojectCriteria);
    const posts = getPostElements().filter(post => !isBlacklistedPost(post));

    for (const post of posts) {
        const postTags = new Set(parseTags(post.dataset.tags ?? '').whitelist);

        if (!matchesCriteria(postTags, projectCriteria)) continue;

        const validOptions = getValidOptions(project, postTags);

        if (validOptions.length === 0) continue;

        const filteredProject = {...project, options: validOptions};

        getPostProjects(post).set(filteredProject.tagprojectName, filteredProject);

        post.classList.add('highlighted-post');

        if (!post._mouseEnterHandler) {
            addMouseEnterHandler(post, allowMultiple);
        }
        console.log('Highlighted post: ', post.dataset.id);
    }
}

function clearHighlights() {
    document
        .querySelectorAll('.highlighted-post')
        .forEach(post => {
            removeMouseHandlers(post);

            post.classList.remove(
                'highlighted-post'
            );

            simulatedTags.delete(post);
            postProjects.delete(post);
            completedProjects.delete(post);
        });

    hideZoomContainer();
}
//message handler for browser
function handleMessage(message){
    if (message.action === 'highlightPost') {
        highlightPosts(message.project, message.allowMultiple);
        return Promise.resolve(true);
    }
    if (message.action === 'clearHighlights') {
        clearHighlights();
        return Promise.resolve(true);
    }
    if (message.action === 'sendChange'){
        console.log(message);
        return requestQueue.add(() =>
            postChange(message.change. postnum,message.change.change, message.change.projectName)
        );
    }
    if(message.action === 'appendCriteria'){
        appendCriteria(message.criteria);
        return Promise.resolve(true);
    }
}
//initialization of content script
async function initialize(){
    browser.runtime.onMessage.addListener(handleMessage);
    taggingProjects = await loadBrowserData();
    console.log('Content Script Initialized.');

    zoomContainer = document.createElement('div');
    zoomContainer.id = 'zoomContainer';
    document.body.append(zoomContainer);

    iFrame = document.createElement('iframe');
    zoomContainer.appendChild(iFrame);

    zoomOptions = document.createElement('div');
    zoomOptions.className = 'zoom-options';
    zoomContainer.append(zoomOptions);
    
    zoomContainer.addEventListener('mouseenter', () => {
        cancelHideZoom();
    });

    zoomContainer.addEventListener('mouseleave', () => {
        scheduleHideZoom();
    });
}

initialize();
