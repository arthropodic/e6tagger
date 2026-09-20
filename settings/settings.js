//DOM's at the top
const menuButtons = [...document.getElementById('bar').children];//[0] Tagging Projects menu button, [1] Settings menu button. Radial buttons
const taggingprojectMenu = document.getElementById('tagging-project-menu');
const createdProjectsContainer = document.getElementById('created-projects-container');
const loadProjectInput = document.getElementById('loadProject');
const createNewProjectButton = document.getElementById('create-new');
const createNewProjectButtonDropdown = document.getElementById('create-project-select-dropdown');
const projectFormContainer = document.getElementById('project-form-container');
const criteriaInput = document.getElementById('criteria'); //TODO set up a criteria system for standard vs missing tags
const criteriaVariantContainer = document.getElementById('criteria-variants-container');
const criteriaVariantButton = document.getElementById('criteria-variants-button');
const CriteriaVariantDropdown = document.getElementById('variant-dropdown');
const templateWrapper = document.getElementById('template-wrapper');
const optionsContainer = document.getElementById('optionsArea');
const addOptionButton = document.getElementById('addOption');
const saveButton = document.getElementById('save-button');
const saveNewButton = document.getElementById('save-new-button');
const settingsMenu = document.getElementById('settings-menu');
const workflowMenu = document.getElementById('workflow-menu');
const workflowButtons = [document.getElementById('workflow1'),document.getElementById('workflow2')];//radial
const queuelessBox = document.getElementById('queueless');
const criteriaVariantSetting = document.getElementById('criteria-variants-setting');
const projectChainingSetting = document.getElementById('project-chaining-setting');
const stylingMenu = document.getElementById('styling-menu');
//independent variables
var defaultTaggingProjects = {taggingProjects:[],
                            queue: {isactive:true,content:[]},
                            workflow:1,
                            variantCriteria:false,
                            projectChaining:false
                            }; //TODO standardize pulling this from one source between all documents
let taggingProjects;
let currentProjectId;
const STORAGE_KEY = 'taggingProjects';

//Functions
//saving extension data
async function saveList(list) {
    await browser.storage.local.set({
        [STORAGE_KEY]: list
    });
}
//Initializing data for page
async function initialize(){
    console.log('Loading extension data...');
    const result = await browser.storage.local.get(STORAGE_KEY);
    //first time use handler
    if(!result[STORAGE_KEY]){
        console.log('First time using extension.');

        taggingProjects = structuredClone(defaultTaggingProjects);
        await saveList(taggingProjects);
    }else{
        taggingProjects = result[STORAGE_KEY];
    }
    console.log('Loaded:', taggingProjects);
    
    //initializing
    //tagging project menu
    menuButtons[0].click()//tagging projects menu is open by default
    for (const project of taggingProjects.taggingProjects) { //loading in tagging projects
        createProjectElement(project);
    }
    //settings menu
    //workflow
    workflowMenu.children[taggingProjects.workflow - 1].classList.add('focus'); //TODO Workflow isn't a boolean for design choice, for adding possible future workflows. Despite workflow not being a hidden attribute, catch when its not valid. 
    //queueless
    const checked = taggingProjects.queue.isactive;
    workflowMenu.children[2].children[0].checked = !checked;
    //Criteria variant
    criteriaVariantSetting.checked = taggingProjects.variantCriteria;
    //project chaining
    projectChainingSetting.checked = taggingProjects.projectChaining;
}
//Radial Function (to be used in conjunction with eventlisteners for the 'this' call)
function radialCheck(group, action) {
    return function () {
        //radial logic
        group.forEach(button => {
            if (button !== this) {
                button.classList.remove('focus');
            }
        });
        //this button specific logic
        this.classList.toggle('focus');
        action.call(this);
    };
}
//saving projects as JSON
function saveJsonToFile(data, filename = 'data.json') {
    const { id, ...projectData } = data;
    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type:'application/json'});

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
//tagging project option UI creation
function createOption(option='',change=''){
    const optionX = document.createElement('div');
    optionX.classList.add('option');

    const optionxDescription = document.createElement('input');
    optionxDescription.type = 'text';
    optionxDescription.placeholder = 'Option Text...';
    optionxDescription.value = option;

    const optionxChanges = document.createElement('input');
    optionxChanges.type = 'text';
    optionxChanges.placeholder = 'Tag Change(s)...';
    optionxChanges.value = change;

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'X';
    deleteButton.style = 'width:100%;';
    deleteButton.classList.add('deletetype');
    deleteButton.addEventListener('click', () => {
        optionX.remove();
    });
    optionX.append(optionxDescription, optionxChanges, deleteButton);
    optionsContainer.append(optionX);
}
//pull the project from taggingProjects
function getProjectById(id) {
    return taggingProjects.taggingProjects.find(project => project.id === id);
}
//radial for projectelements specifically
function clearProjectFocus() {
    [...createdProjectsContainer.children].slice(2).forEach(projectElement => {projectElement.querySelector('button')?.classList.remove('focus');});
}
//preestablished tagging project data insertion
function loadProjectIntoForm(project){
    try{
        currentProjectId = project.id;
        projectFormContainer.children[0].value = project.tagprojectName;
        projectFormContainer.children[1].value = project.tagprojectDescription;
        criteriaInput.value = project.tagprojectCriteria;
        templateWrapper.children[0].checked = project.template;
        optionsContainer.innerHTML = ''; //due to variable length of options, need to remove all options first
        for (const option of project.options) {
            createOption(option.option, option.change);
        }
    }catch (error){
        console.error('Cannot load data:', error);
    }
}
//pulling project. if it has an ID, then it will be passed through here with no issue.
function getProjectFromForm() {
    const name = projectFormContainer.children[0].value.trim();
    const description = projectFormContainer.children[1].value.trim();
    const criteria = criteriaInput.value.trim();
    const template = templateWrapper.children[0].checked;
    const options = [...optionsContainer.children].map(optionElement => ({
        option: optionElement.children[0].value.trim(),
        change: optionElement.children[1].value.trim()
    }));
    return {
        tagprojectName: name,
        tagprojectDescription: description,
        tagprojectCriteria: criteria,
        template: template,
        options
    };
}
//creating a blank new project
function wipeProjectFormBlank(){
    currentProjectId = null;
    projectFormContainer.children[0].value = '';
    projectFormContainer.children[1].value = '';
    criteriaInput.value = '';
    optionsContainer.innerHTML = '';
    //2 options for default
    createOption();
    createOption();
}
//Create UI for project
function createProjectElement(project){
    const projectX = document.createElement('div');
    projectX.classList.add('projectconfigure');
    projectX.dataset.projectId = project.id;
    
    const projectxButton = document.createElement('button');
    projectxButton.textContent = project.tagprojectName;
    projectxButton.style = 'width:100%;height:100%;';
    projectX.append(projectxButton);

    projectxButton.addEventListener('click', function (){
        clearProjectFocus();
        projectxButton.classList.toggle('focus');
        if(projectxButton.classList.contains('focus')){
            const project = getProjectById(projectX.dataset.projectId);
            if (project) {
                saveNewButton.style.display = 'block'; // it goes bar button tagging projects -> options area empty -> save new button is not displayed UNLESS project button is pressed or aleady there,  in this case
                loadProjectIntoForm(project);
            }
        }
    })

    const saveButton = document.createElement('button');
    saveButton.textContent = 'save';
    saveButton.style.color = '#ffffff';
    saveButton.style = 'width:100%;height:100%;';
    saveButton.addEventListener('click', () => {
        const project = getProjectById(projectX.dataset.projectId);
        if (project) {
            saveJsonToFile(project,project.tagprojectName + '.json');
        }
    }); 

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'X';
    deleteButton.style = 'width:100%;height:100%;';
    deleteButton.classList.add('deletetype');
    deleteButton.addEventListener('click', async () => {
        const projectId = projectX.dataset.projectId;
        taggingProjects.taggingProjects = taggingProjects.taggingProjects.filter(x => x.id !== projectId);//removing from actual index
        projectX.remove();
        if (currentProjectId === projectId) {
            wipeProjectFormBlank();
        }
        await saveList(taggingProjects);
    }); 
    projectX.append(saveButton,deleteButton);
    createdProjectsContainer.append(projectX);
}
//validate form
function validateProjectForm() { //TODO add a check for criteria conflicts, throw error w/ console log message when that happens or make message system to tell user.
    const projectName = projectFormContainer.children[0];
    const projectCriteria = criteriaInput;
    let isValid = true;
  
    const validateInput = input => {//Validate a single input
        const empty = !input.value.trim();
        input.classList.toggle('warning', empty);
        if (empty) {
            isValid = false;
        }
        return !empty;
    };
  
    const validateCharacters = input => { //whitespace, -, _, and a-z is allowed.
        const value = input.value.trim();
        const valid = /^[A-Za-z _-]+$/.test(value);
        input.classList.toggle('warning', !valid);
        if (!valid) {
            isValid = false;
        }
        return valid;
    };

    const validateTags = input => {
        const value = input.value.trim();
        //Split the input into individual tags
        const tags = value.split(/\s+/);
        const valid = tags.every(tag => {
            return /^-?[A-Za-z][A-Za-z_-]*$/.test(tag);// A tag may optionally begin with '-', must contain at least one letter, may contain letters '-' or '_'.
        });
        input.classList.toggle('warning', !valid);
        if (!valid) {
            isValid = false;
        }
        return valid;
    };
    //validate name & criteria
    validateInput(projectName);
    validateInput(projectCriteria);
    // Validate options
    for (const option of optionsContainer.children) {
        validateInput(option.children[0]);
        const tagsInput = option.children[1];
        validateInput(tagsInput);
        if (tagsInput.value.trim()) {
            if (validateCharacters(tagsInput)) {
                validateTags(tagsInput);
            }
        }
    }
    return isValid;
}
//create new project
async function saveProject(saveAsNew=false){
    if (!validateProjectForm()) {
        return;
    }
    const project = getProjectFromForm();
    // Save as new project
    if (saveAsNew || !currentProjectId) {
        project.id = crypto.randomUUID();
        taggingProjects.taggingProjects.push(project);
        createProjectElement(project);
        currentProjectId = project.id;
    }
    // Save existing project
    else {
        project.id = currentProjectId;
        const index = taggingProjects.taggingProjects.findIndex(existingProject => existingProject.id === currentProjectId);
        if (index === -1) {
            console.error("Could not find current project.");
            return;
        }
        Object.assign(taggingProjects.taggingProjects[index], project);
    }
    await saveList(taggingProjects);
}
//Event listeners(extensions forbid onclick)
//menu radial buttons
//tagging project menu
menuButtons[0].addEventListener('click', radialCheck(menuButtons, function (){
    if (settingsMenu.style.display === 'grid'){
        settingsMenu.style.display = 'none';
    }
    taggingprojectMenu.style.display = 'grid';
    console.log(optionsContainer.children.length);
    if (optionsContainer.children.length < 1){
        saveNewButton.style.display = 'none';
        wipeProjectFormBlank();
    }
    if(taggingProjects.variantCriteria) {
        criteriaVariantContainer.style.display = 'block';
    }else{
        criteriaVariantContainer.style.display = 'none';
    }
}))
//Settings menu
menuButtons[1].addEventListener('click', radialCheck(menuButtons, function (){
    if (taggingprojectMenu.style.display === 'grid'){
        taggingprojectMenu.style.display = 'none';
    }
    settingsMenu.style.display = 'grid'; 
}))
//loading project from file button
loadProjectInput.addEventListener("change", async (event) => { 
    for (const file of event.target.files) {
        try {
            const project = JSON.parse(await file.text());
            project.id = crypto.randomUUID();
            taggingProjects.taggingProjects.push(project);
            createProjectElement(project);
        } catch (err) {
            console.error(`Failed to load ${file.name}:`, err);
        }
    }
    await saveList(taggingProjects);
    event.target.value = "";
});
//template checkbox
templateWrapper.children[0].addEventListener('change', async () => {
    console.log("lol");
    //templateWrapper.children[2].style.display = templateWrapper.children[0].checked ? 'block':'none';
    //Lets say your trying to enforce a standard to posts with the "cactus" tag. cactus normally have "spines" and are "green". So a template project in is case would have the criteria of "cactus", then when the project is clicked each post is checked for if they do not contain the changes of the options. The options that will be displayed are the tags/changes that the post doesnt have. so in this case, if the post has spines but isnt tagged with green, then the green option would be displayed.
})
//add option button
addOptionButton.addEventListener('click', () => {
    createOption();
})
//project Select dropdown
createNewProjectButton.addEventListener('click', () => {
    createNewProjectButtonDropdown.children[0].style.display = createdProjectsContainer.children.length < 2 ? 'none' : 'block'; //this line solves two logic issues w/ create new project "making a new project" instead of wiping the form clean.
    createNewProjectButton.classList.toggle('focus');
    createNewProjectButtonDropdown.classList.toggle('open');
})
//create new project
createNewProjectButtonDropdown.children[0].addEventListener('click', () => {
saveNewButton.style.display = 'none';
    clearProjectFocus();
    wipeProjectFormBlank();
    createNewProjectButton.classList.toggle('focus');
    createNewProjectButtonDropdown.classList.toggle('open');
})
//load project(s) from file
createNewProjectButtonDropdown.children[1].addEventListener('click', () => {
    loadProjectInput.click()
    createNewProjectButton.classList.toggle('focus');
    createNewProjectButtonDropdown.classList.toggle('open');
})
//criteria variant button dropdown
criteriaVariantButton.addEventListener('click', () => {
    criteriaVariantButton.classList.toggle('focus');
    CriteriaVariantDropdown.classList.toggle('open');
})
//criteria variants:
//strict
CriteriaVariantDropdown.children[0].addEventListener('click', () => {
    criteriaInput.value += (criteriaInput.value ? ' ' : '') + 'solo -duo -trio -group -multiple_images -multiple_scenes';
    criteriaVariantButton.classList.toggle('focus');
    CriteriaVariantDropdown.classList.toggle('open');
})
//multi-character
CriteriaVariantDropdown.children[1].addEventListener('click', () => {
    criteriaInput.value += (criteriaInput.value ? ' ' : '') + '-multiple_images -multiple_scenes';
    criteriaVariantButton.classList.toggle('focus');
    CriteriaVariantDropdown.classList.toggle('open');
})
//color-based
CriteriaVariantDropdown.children[2].addEventListener('click', () => {
    criteriaInput.value += (criteriaInput.value ? ' ' : '') + '-monochrome';
    criteriaVariantButton.classList.toggle('focus');
    CriteriaVariantDropdown.classList.toggle('open');
})
//inverse-options
CriteriaVariantDropdown.children[3].addEventListener('click', () => {
    let changes = [...optionsContainer.children]
        .map(optionElement => optionElement.children[1].value.trim())
        .filter(value => value !== '')
        .map(value => {
            // Flip whitelist ↔ blacklist
            return value.startsWith('-')
                ? value.slice(1)
                : '-' + value;
        })
        .join(' ');

    criteriaInput.value += ' ' + changes;
    criteriaInput.value = criteriaInput.value.replace(/\s+/g, ' ');
    criteriaVariantButton.classList.toggle('focus');
    CriteriaVariantDropdown.classList.toggle('open');
})
//save project button
saveButton.addEventListener('click', async () => {
    saveNewButton.style.display = 'block'; // it goes bar button tagging projects -> options area empty -> save new button is not displayed UNTIL its saved,  in this case
    await saveProject();
})
//save new project button
saveNewButton.addEventListener('click', async () => {
    await saveProject(true);
})
//Workflow menu TODO add multi option choice, radial option choice(add/remove focus), then add the border highlight to be optional (trigger on any post, all tagging projects). Make blacklist post filtering optional. option for trigger all on 1 button, or page load.
//workflow radial buttons
//Workflow 1 button
workflowButtons[0].addEventListener('click', radialCheck(workflowButtons, async function (){
    taggingProjects.workflow = 1;
    //console.log(taggingProjects);
    await saveList(taggingProjects);
}))
//Workflow 2 button
workflowButtons[1].addEventListener('click', radialCheck(workflowButtons, async function (){
    taggingProjects.workflow = 2;
    //console.log(taggingProjects);
    await saveList(taggingProjects);
}))
//queueless checkbox TODO add optional request blocking, will convert 150 changes into a block of changes that can be saved and loaded into queue.
queuelessBox.addEventListener('change', async () => {
    //if its checked, taggingProjects.queue.isactive should be false, when its unchecked it should be true.
    let checked = queuelessBox.checked;
    taggingProjects.queue.isactive = checked ? false : true;
    console.log(taggingProjects.queue.isactive);
    await saveList(taggingProjects);
})
//Criteria variant checkbox (advanced users). It adds a button to the side of the criteria box that when clicked will throw a popdown menu of 3 options:
//Strict: solo -duo -trio -group -multiple_images -multiple_scenes
//multi-character: -multiple_images -multiple_scene
//color-based: -monochrome
criteriaVariantSetting.addEventListener('change', async () => {
    taggingProjects.variantCriteria = criteriaVariantSetting.checked ? true : false;
    console.log(taggingProjects);
    await saveList(taggingProjects);
})
//project chaining (if a project enables another project based on criteria)
projectChainingSetting.addEventListener('change', async () => {
    taggingProjects.projectChaining = projectChainingSetting.checked ? true : false;
    console.log(taggingProjects);
    await saveList(taggingProjects);
})
//excecuting
initialize();//starting everything
//1. finding tagging project (ex. posts without a nipple color)
//2. (optional) narrow set of posts to something more managable (I usually only do posts I've liked with votedup:everything). You may also find that your project might work ontop of other projects, for example the nipple_color would inherently require nipples tag, however you should verify that all the posts in your set that have nipples also have the nipples tag
//3. Start with with nipples (or breasts) whitelist tag in criteria, add inverse-options criteria variant of every nipple color option. Then add strict criteria variant, save project with (strict) at the end.
//4. add criteria to your set of posts you need to tag, the, use the just created strict project to tag them all.
//5. Once your done with that, remove the previously added strict tags, then add the multi-character criteria variant, save project with (multi-character) at the end.
//6. tag all posts in your set with the multi-character tagging project, with the multi-option checkbox enabled for multiple characters.
//7. remove the previously added mult-character tags, then tag the rest of the posts in your set with multi-option enabled for multi_series/multi_image posts.
//8. if any posts are left, adjust your criteria based on how those posts dont fall within the scope of your tagging project (in the case of nipple_color, monochrome posts wouldnt count. So add color-based criteria variant to your criteria)
