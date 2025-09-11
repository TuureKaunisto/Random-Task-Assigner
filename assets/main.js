var test;
(() => {
const available = {};
function domLoaded() {
    setInitialTasks();
    setInitialParticipants();

    const settingsDialog = document.querySelector('#settings-dialog');
    document.querySelector('#close-settings').addEventListener('click', () => settingsDialog.close());
    settingsDialog.addEventListener('click', event => {
        if (event.target === settingsDialog) {
            settingsDialog.close();
        }
    });
    document.querySelector('#select-participants').addEventListener('click', () => {
        displaySelectedParticipants(selectParticipants());
    });
}

function setInputValueFromUrl(input, value) {
    // assign task in an XSS safe manner ( https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html#guideline-3-use-documentcreateelement-elementsetattributevalue-elementappendchild-and-similar-to-build-dynamic-interfaces )
    input.value = decodeURIComponent(value);
}

function getUrlHashValues() {
    const [urlParticipantString, urlTaskString] = location.hash.replace(/^#/, '').split('//');
    return [
        urlParticipantString ? urlParticipantString?.split('/') : undefined,
        urlTaskString?.split('/')
    ]
}

function setInitialTasks() {
    const [, urlTasks] = getUrlHashValues();
    const taskPlaceholder = 'Task name';
    if (urlTasks) {
        [...urlTasks, ''].forEach(urlTask => {
            const newInput = addInput(document.querySelector('#tasks'), '', taskPlaceholder, true);
            setInputValueFromUrl(newInput, urlTask)
        })
    } else {
        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', '']
            .forEach(day => addInput(document.querySelector('#tasks'), day, taskPlaceholder, true));
    }
}

function setInitialParticipants() {
    const [urlParticipants] = getUrlHashValues();
    const participantPlaceholder = 'Participant name';

    if (urlParticipants) {
        const tasks = getTasks();

        [...urlParticipants, ''].forEach(urlParticipant => {
            const [urlName, availabilityAsHex] = urlParticipant.split(';');
            const newInput = addInput(document.querySelector('#participants'), '', participantPlaceholder);
            setInputValueFromUrl(newInput, urlName)
            if (availabilityAsHex) {
                const bitmask = parseInt(availabilityAsHex, 16).toString(2).padStart(tasks.length, '0');
                tasks.forEach((task, index) => setAvailability(task.id, newInput.dataset.id, bitmask[index] !== '0'));
            }
        });
    } else {
        ['Alice', 'Bob', 'Carol', 'Dan', 'Erin', 'Frank', '']
            .forEach(name => addInput(document.querySelector('#participants'), name, participantPlaceholder));
    }
}

function updateUrlHash() {
    const tasks = getTasks();
    const participantsForHash = getParticipants().map(participant => {
        const name = encodeURIComponent(participant.name)
        const availabilityBitmask = tasks.map(task => getAvailability(task.id, participant.id) ? '1' : '0').join('');
        const availabilityAsHex = availabilityBitmask.includes('0') ? parseInt(availabilityBitmask, 2).toString(16) : '';
        return `${name}${availabilityAsHex ? ';' : ''}${availabilityAsHex}`;
    }).join('/');
    const tasksForHash = tasks.map(task => encodeURIComponent(task.name)).join('/');
    location.hash = `${participantsForHash}//${tasksForHash}`;
}

function addInput(parent, value = '', placeholder = '', isTask = false) {
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.value = value;
    newInput.placeholder = placeholder;
    newInput.ariaLabel = placeholder;
    newInput.dataset.id = crypto.randomUUID();
    newInput.addEventListener('input', ensureEmptyInputAtTheEnd.bind(null, parent, placeholder, isTask));

    const newElement = document.createElement('div');
    newElement.className = 'input-element';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove';
    removeButton.ariaLabel = 'Remove';
    removeButton.title = 'Remove';
    removeButton.addEventListener('click', () => removeInput(newElement));

    newElement.appendChild(newInput);
    if (!isTask) {
        const availabilityIndicator = document.createElement('span');
        availabilityIndicator.title = 'Availability'
        availabilityIndicator.ariaLabel = 'Availability'
        availabilityIndicator.className = 'availability';

        const settingsButton = document.createElement('button');
        settingsButton.textContent = 'Settings';
        settingsButton.className = 'settings';
        settingsButton.addEventListener('click', () => showSettingsFor(newInput));

        newElement.appendChild(availabilityIndicator);
        newElement.appendChild(settingsButton);
    }
    newElement.appendChild(removeButton);
    parent.appendChild(newElement);
    updateAvailability();
    return newInput;
}

function removeInput(element) {
    element?.remove();
    updateAvailability();
}

function getInputs(selector) {
    return [...document.querySelectorAll(selector)]
        .filter(input => Boolean(input.value))
        .map(input => ({
            id: input.dataset.id,
            name: input.value,
            element: input
        }));
}

function getTasks() {
    return getInputs('#tasks input');
}

function getParticipants() {
    return getInputs('#participants input');
}

function setAvailability(taskId, participantId, isAvailable) {
    available[taskId] = available[taskId] ?? {};
    available[taskId][participantId] = isAvailable;
    updateAvailability();
}

function getAvailability(taskId, participantId) {
    return available?.[taskId]?.[participantId] !== false;
}

function getAvailabilityCount(participantId) {
    return getTasks().reduce((accumulator, task) =>
        getAvailability(task.id, participantId) ? accumulator + 1 : accumulator
    , 0);
}

function updateAvailability() {
    const participants = getParticipants();
    participants.forEach(participant => {
        const availabilityIndicator = participant.element?.parentElement?.querySelector('.availability');
        if (availabilityIndicator) {
            availabilityIndicator.textContent = getAvailabilityCount(participant.id);
        }
    })
}

function getParticipantName(participantId) {
    return document.querySelector(`#participants input[data-id="${participantId}"]`)?.value ?? 'Not found';
}

function showSettingsFor(participantInput) {
    const participant = participantInput.value;
    const dialog = document.querySelector('#settings-dialog');
    document.querySelector('#availability-participant').textContent = participant;
    const taskContainer = document.querySelector('#availability-tasks');
    taskContainer.replaceChildren();

    document.querySelectorAll('#tasks input').forEach(taskInput => {
        if (!taskInput.value) {
            return;
        }
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = getAvailability(taskInput.dataset.id, participantInput.dataset.id);
        checkbox.addEventListener('change', (event) => setAvailability(taskInput.dataset.id, participantInput.dataset.id, event.target.checked));
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(taskInput.value));
        taskContainer.appendChild(label);
    });
    dialog.showModal();
}

function ensureEmptyInputAtTheEnd(parent, placeholder, isTask = false) {
    const lastInput = parent.querySelector('div:last-of-type > input');
    if (lastInput.value.length > 0) {
        addInput(parent, '' , placeholder, isTask);
    }
}

function shuffleArray(array) {
    const shuffledArray = [...array];
    for (let i = shuffledArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
    }
    return shuffledArray;
}

function getRandomRotation() {
    return shuffleArray(
        getParticipants()
        .map(participant => participant.id)
    );
}

function shiftNextParticipant(participantRotation) {
    if (participantRotation.length === 0) {
        participantRotation.push(...getRandomRotation());
    }
    return participantRotation.shift();
}

function getNextAvailable(participantRotation, task) {
    const participantCount = getParticipants().length;
    for (i = 0; i < participantCount + 1; i++) {
        const participantId = shiftNextParticipant(participantRotation);
        if (getAvailability(task.id, participantId)) {
            return participantId;
        }
    }
    return null;
}

function selectParticipants() {
    updateUrlHash();
    const results = {};
    const participantRotation = [];
    shuffleArray(getTasks()).forEach((task, index) => {
        let selectedParticipantId = getNextAvailable(participantRotation, task);
        if (!getAvailability(task.id, selectedParticipantId)) {
            selectedParticipantId = null;
        }

        results[task.name] = selectedParticipantId;
    });
    return results;
}

function displaySelectedParticipants(results) {
    const resultElement = document.querySelector('#result-text')
    const tasks = getTasks();
    resultElement.rows = tasks.length + 1;
    resultElement.value = tasks
        .map(task => `${task.name}: ${results[task.name] ? '@' : ''}${getParticipantName(results[task.name])}`)
        .join('\n');
}

test = function(iterations = 10000) {
    const participationCount = {};
    const countByTask = {};
    for (var i = 0; i < iterations; i++) {
        const tasks = Object.entries(selectParticipants());
        tasks.forEach(([task, participantId]) => {
            participationCount[participantId] = participationCount[participantId] ?? 0;
            participationCount[participantId]++;

            countByTask[task] = countByTask[task] ?? {};
            countByTask[task][participantId] = countByTask[task][participantId] ?? 0;
            countByTask[task][participantId]++;
        })
    }
    console.log(Object.entries(participationCount).map(([participantId, timesParticipated]) => ({
        participant: getParticipantName(participantId),
        selectedPercentage: (timesParticipated / iterations) * 100
    })));
    console.log('Count by task', Object.entries(countByTask).map(([task, participantCounts]) => ({
        task,
        participantCounts: Object.entries(participantCounts).map(([participantId, count]) => ({
            participant: getParticipantName(participantId),
            count
        }))
    })));
}

addEventListener('DOMContentLoaded', domLoaded);
})()