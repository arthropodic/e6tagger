//TODO make the site interactions cross extension compatable
const STORAGE_KEY = 'taggingProjects';
let taggingProjects;
const requestQueue = new TaskQueue();
//project chaining
const selectedProjects = new Set();
const originalMatches = new WeakMap();
//project chaining + queue
const simulatedTags = new WeakMap();
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
        _client: 'e6tagger/0.1 (by arthropodic)'
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

function getPostElements() {
    return [
    ...document.querySelectorAll('article.thumbnail'),//vanilla
    ...document.querySelectorAll('post')//re621
    ];
}
//re621 detection
function isRe621Post(post) {
    return post.tagName.toLowerCase() === 'post';
}
// clears whatever falls within criteria TODO add gif/mp4/webm integration
function loadImage(img, src) {
    return new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
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

function addOptionsAreas(post, allowMultiple = false, ...projects){
    let wrapper = post.querySelector('.options-wrapper');
    // Get or create the wrapper for this post
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.classList.add('options-wrapper');
        wrapper.style.display = 'none';
        post.append(wrapper);
    }

    for (const project of projects) {
        // Don't create a duplicate options-area for the same project
        if (wrapper.querySelector(`.options-area[data-project="${project.tagprojectName}"]`)) {
            continue;
        }
        const optionsArea = document.createElement('div');
        optionsArea.classList.add('options-area');
        optionsArea.dataset.project = project.tagprojectName;
        //for allowMultiple behavior
        const selectedOptions = new Set();

        for (const option of project.options) {
            const optionX = document.createElement('button');
            optionX.classList.add('option');
            optionX.innerText = option.option;
            optionX.addEventListener('click', async () => {
                if(allowMultiple){
                    optionX.classList.toggle('focus');
                    if(optionX.classList.contains('focus')){
                        selectedOptions.add(option.change);
                    }else{
                        selectedOptions.delete(option.change);
                    }
                    console.log(selectedOptions);
                    return;
                }

                console.log(post.dataset.id, option.change, project.tagprojectName);
                //queue process here
                if(taggingProjects.queue.isactive){//TODO rework queue compression to be on by default, call it "auto-compression"
                    //TODO if queue is active, pull ALL changes for current post (if theyre compressed) then throw them through the project chaining
                    taggingProjects.queue.content.push({type:'change',postnum:post.dataset.id, change:option.change, projectName: project.tagprojectName})
                    saveList(taggingProjects);
                }else{
                    postChange(post.dataset.id, option.change, project.tagprojectName);
                }
                if(taggingProjects.projectChaining){ //TODO bug fix when 1 project's change has been sent, you click a different project & it re-adds the first project's option area
                    const currentTags = getCurrentTags(post);
                    const newTags = applyChangeToTags(currentTags, option.change);

                    simulatedTags.set(post,newTags);
                    updatePostProjects(post, newTags, allowMultiple);//slightly recursive, investigate if this can be changed.
                }
                removeOptionsArea(post, project);
            });
            optionsArea.append(optionX);
        }
        if(allowMultiple){
            const submitOption = document.createElement('button');
            submitOption.classList.add('option');
            submitOption.style.flexBasis = '100%';
            submitOption.innerText = 'Submit'; 
            submitOption.addEventListener('click', function(){
                if (selectedOptions.size === 0){
                    return;
                }
                const combinedChange = [...selectedOptions].join(' ');
                console.log(post.dataset.id, combinedChange);

                if(taggingProjects.queue.isactive){
                    taggingProjects.queue.content.push({type:'change',postnum:post.dataset.id, change:combinedChange})
                    saveList(taggingProjects);
                }else{
                    postChange(post.dataset.id, combinedChange, project.tagprojectName);
                }

                if(taggingProjects.projectChaining){
                    const currentTags = getCurrentTags(post);
                    const newTags = applyChangeToTags(currentTags, combinedChange);
                    simulatedTags.set(post,newTags);
                    updatePostProjects(post, newTags, allowMultiple);//slightly recursive, investigate if this can be changed.
                }
                removeOptionsArea(post, project);
            });
            optionsArea.append(submitOption);
        }
        wrapper.append(optionsArea);
    }
}
//addOptionsAreas(post, projectA, projectB, projectC);

function removeOptionsArea(post, project) {
    const wrapper = post.querySelector('.options-wrapper');

    if (!wrapper) {
        console.log('post cannot locate the wrapper');
        return;
    }

    const optionsArea = wrapper.querySelector(`.options-area[data-project='${project.tagprojectName}']`);

    if (optionsArea) {
        optionsArea.remove();
    }

    // If there are no options areas left, remove the wrapper too
    if (wrapper.children.length === 0) {
        wrapper.remove();
        removeMouseHandlers(post)
        post.classList.remove('highlighted-post');
    }
}

function addMouseEnterHandler(post) {
    const wrapper = post.querySelector('.options-wrapper');
    const imgEl = post.querySelector('picture img');

    if (!wrapper || !imgEl) {
        console.log('post cannot locate the wrapper or img');
        return;
    }

    const sample = post.dataset.sampleUrl;
    
    // Only capture the original image once
    if (!post._originalImg) {
        post._originalImg = imgEl.src;
    }

    const mouseEnterHandler = async () => {
        post.classList.add('hovered');
        wrapper.style.display = 'flex';
        // Calculate how much the article is overflowing horizontally
        const adjustHorizontalPosition = () => {
            const rect = post.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth;

            let offset = 0;
            // Overflowing right
            if (rect.right > viewportWidth) {
                offset -= (rect.right + 10) - viewportWidth;
            }
            // Overflowing left
            if (rect.left < 0) {
                offset += -rect.left;
            }

            post.style.setProperty('--hover-x', `${offset}px`);
        };

        await loadImage(imgEl, sample);

        requestAnimationFrame(() => {
            adjustHorizontalPosition();
        });
    
    };

    post._mouseEnterHandler = mouseEnterHandler;
    post.addEventListener('mouseenter', mouseEnterHandler);
}

function addMouseLeaveHandler(post) {
    const wrapper = post.querySelector('.options-wrapper');
    const imgEl = post.querySelector('picture img');

    if (!wrapper || !imgEl) {
        console.log('post cannot locate the wrapper or img');
        return;
    }

    post._mouseLeaveHandler = function () {
        imgEl.src = post._originalImg;

        wrapper.style.display = 'none';

        post.classList.remove('hovered');
        post.style.removeProperty('--hover-x');
    };

    post.addEventListener('mouseleave', post._mouseLeaveHandler);
}
//TODO make createMouseHandlers function, then place both handler creation function into it.
function removeMouseHandlers(post) {
    if (post._mouseEnterHandler){
        post.removeEventListener('mouseenter',post._mouseEnterHandler);
        delete post._mouseEnterHandler;
    }

    if (post._mouseLeaveHandler){
        post.removeEventListener('mouseleave',post._mouseLeaveHandler);
        post._mouseLeaveHandler();
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
    for (const project of selectedProjects) {
        const criteria = parseTags(project.tagprojectCriteria);

        if (!matchesCriteria(tags, criteria)) continue;

        addOptionsAreas(post, allowMultiple, project);
    }
}
// workflow 1 main function
function highlightPosts(project, allowMultiple) { //TODO rename to workflow 1
    selectedProjects.add(project);
    
    const projectCriteria = parseTags(project.tagprojectCriteria)

    const posts = getPostElements().filter(post => !isBlacklistedPost(post));
    console.log(posts)
    
    for (const post of posts){
    
        //const data = getPostData(post);
        //console.log(data.id);
        //console.log(data.tags);
        //console.log(data.image);

        const postTags = new Set(parseTags(post.dataset.tags ?? "").whitelist);
        let validOptions = [];
        if (!matchesCriteria(postTags, projectCriteria)) continue;
        if (project.template){
            for (const option of project.options){
                const parsedChange = parseTags(option.change);
                
                const hasAllWhitelist = parsedChange.whitelist.every(tag => postTags.has(tag));
                const hasAllBlacklist = parsedChange.blacklist.every(tag => postTags.has(tag));

                const needsFix = !hasAllWhitelist || !hasAllBlacklist;
                if (needsFix) {
                    validOptions.push(option);
                }
            }
            
        }else{
            validOptions = project.options;
        }
        if (validOptions.length === 0) continue;
        console.log(post.dataset.id);
        if (!originalMatches.has(post)) {
            originalMatches.set(post, new Set());
        }
        originalMatches.get(post).add(project);
        //cosmetics
        post.classList.add('highlighted-post');
        //removing the source because the site wants to back it up when the thumbnail is pulled
        post.querySelectorAll('source').forEach(s => s.remove());
        // Pass a shallow copy of the project containing only the filtered valid options
        const filteredProject = { ...project, options: validOptions };
        //passing allowMultiple because it SHOULD be boolean
        addOptionsAreas(post, allowMultiple, filteredProject);
        if (!post._mouseEnterHandler){
            addMouseEnterHandler(post);
        }
        if (!post._mouseLeaveHandler){
            addMouseLeaveHandler(post);
        }
    }
}

function clearHighlights(){
    document.querySelectorAll('.highlighted-post').forEach(post => {
        post.classList.remove('highlighted-post');
        removeMouseHandlers(post)
    });
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
        console.log(message.change.postnum, message.change.change);
        return requestQueue.add(() =>
            postChange(message.change.postnum,message.change.change, message.change.projectName)
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
}

initialize();
