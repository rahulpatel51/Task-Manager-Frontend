// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';

// Global variables
let tasks = [];
let currentFilter = 'all';
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
let activeUsers = 0;

// DOM Elements
const taskListEl = document.getElementById('taskList');
const taskInput = document.getElementById('taskInput');
const addBtn = document.getElementById('addTaskBtn');
const filterBtns = document.querySelectorAll('.filter-btn');
const clearAllBtn = document.getElementById('clearAllTasksBtn');
const toastEl = document.getElementById('toast');
const totalTasksEl = document.getElementById('totalTasks');
const pendingTasksEl = document.getElementById('pendingTasks');
const completedTasksEl = document.getElementById('completedTasks');
const completionRateEl = document.getElementById('completionRate');

let connectionStatusEl = null;

// ========================================
// SOCKET.IO REAL-TIME CONNECTION
// ========================================

function initSocket() {
    if (!connectionStatusEl) {
        connectionStatusEl = document.createElement('div');
        connectionStatusEl.className = 'connection-status';
        connectionStatusEl.innerHTML = `
            <div class="status-dot"></div>
            <span class="status-text">Connecting...</span>
            <span class="users-count"></span>
        `;
        document.querySelector('.app-header').appendChild(connectionStatusEl);
    }
    
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });
    
    socket.on('connect', () => {
        console.log('🟢 Connected to real-time server');
        isConnected = true;
        reconnectAttempts = 0;
        updateConnectionStatus('connected', 'Live');
        showToast('🔄 Real-time updates active', 2000, 'success');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        isConnected = false;
        reconnectAttempts++;
        updateConnectionStatus('connecting', 'Reconnecting...');
        showToast('⚠️ Real-time connection lost. Reconnecting...', 2000, 'warning');
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 Disconnected from real-time server');
        isConnected = false;
        updateConnectionStatus('disconnected', 'Offline');
        showToast('⚠️ Real-time updates disconnected', 2000, 'warning');
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        isConnected = true;
        updateConnectionStatus('connected', 'Live');
        showToast('✅ Real-time updates reconnected', 2000, 'success');
        loadTasks();
    });
    
    socket.on('welcome', (data) => {
        console.log('Welcome:', data.message);
        showToast(`✨ ${data.message}`, 2000, 'success');
    });
    
    socket.on('users-count', (data) => {
        activeUsers = data.count;
        updateConnectionStatus(isConnected ? 'connected' : 'disconnected', 
                            isConnected ? 'Live' : 'Offline', 
                            activeUsers);
    });
    
    socket.on('tasks-update', (update) => {
        console.log('Real-time update received:', update);
        
        switch(update.action) {
            case 'create':
                handleRealTimeCreate(update.data);
                break;
            case 'update':
                handleRealTimeUpdate(update.data);
                break;
            case 'delete':
                handleRealTimeDelete(update.data);
                break;
            case 'clear':
                handleRealTimeClear();
                break;
            default:
                loadTasks();
        }
    });
}

function updateConnectionStatus(status, text, users = null) {
    if (!connectionStatusEl) return;
    
    const statusDot = connectionStatusEl.querySelector('.status-dot');
    const statusText = connectionStatusEl.querySelector('.status-text');
    const usersCountSpan = connectionStatusEl.querySelector('.users-count');
    
    statusDot.className = 'status-dot';
    if (status === 'connected') {
        statusDot.classList.add('connected');
        statusText.textContent = text;
    } else if (status === 'connecting') {
        statusDot.classList.add('connecting');
        statusText.textContent = text;
    } else {
        statusDot.classList.add('disconnected');
        statusText.textContent = text;
    }
    
    if (users !== null && users > 0) {
        usersCountSpan.textContent = `👥 ${users} online`;
        usersCountSpan.style.display = 'inline';
    } else {
        usersCountSpan.style.display = 'none';
    }
}

function handleRealTimeCreate(newTask) {
    const exists = tasks.some(t => t.id === newTask.id);
    if (!exists) {
        tasks.unshift(newTask);
        renderTasks();
        showToast(`✨ New task added by another user: ${newTask.text.substring(0, 40)}`, 3000, 'info');
        
        const newTaskElement = document.querySelector(`[data-id="${newTask.id}"]`);
        if (newTaskElement) {
            newTaskElement.style.animation = 'highlight 0.5s ease';
            setTimeout(() => {
                newTaskElement.style.animation = '';
            }, 500);
        }
    }
}

function handleRealTimeUpdate(updatedTask) {
    const index = tasks.findIndex(t => t.id === updatedTask.id);
    if (index !== -1) {
        const oldTask = tasks[index];
        tasks[index] = updatedTask;
        renderTasks();
        
        if (oldTask.completed !== updatedTask.completed) {
            const status = updatedTask.completed ? 'completed' : 'pending';
            showToast(`📌 Another user marked task as ${status}`, 2000, 'info');
        } else if (oldTask.text !== updatedTask.text) {
            showToast(`✏️ Another user edited a task`, 2000, 'info');
        } else if (oldTask.priority !== updatedTask.priority) {
            showToast(`🎯 Another user changed task priority`, 2000, 'info');
        }
        
        const updatedElement = document.querySelector(`[data-id="${updatedTask.id}"]`);
        if (updatedElement) {
            updatedElement.style.animation = 'highlight 0.5s ease';
            setTimeout(() => {
                updatedElement.style.animation = '';
            }, 500);
        }
    }
}

function handleRealTimeDelete(deletedData) {
    const index = tasks.findIndex(t => t.id === deletedData.id);
    if (index !== -1) {
        const deletedTask = tasks[index];
        tasks.splice(index, 1);
        renderTasks();
        showToast(`🗑️ Another user deleted: ${deletedTask.text.substring(0, 40)}`, 2500, 'info');
    }
}

function handleRealTimeClear() {
    tasks = [];
    renderTasks();
    showToast(`🧹 Another user cleared all tasks`, 2000, 'info');
}

function emitTaskUpdate(action, data) {
    if (socket && isConnected) {
        socket.emit('task-update', { action, data, timestamp: new Date().toISOString() });
    }
}

// ========================================
// MODAL FUNCTIONS
// ========================================

function showModal(options) {
    return new Promise((resolve) => {
        const existingModal = document.querySelector('.custom-modal-overlay');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        
        let inputHtml = '';
        if (options.showInput) {
            inputHtml = `
                <div class="modal-input-group">
                    <input type="text" id="modalInput" class="modal-input" value="${escapeHtml(options.inputValue || '')}" placeholder="Enter task..." autocomplete="off">
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div class="modal-header">
                <h3 class="modal-title">${escapeHtml(options.title)}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <p class="modal-message">${escapeHtml(options.message)}</p>
                ${inputHtml}
            </div>
            <div class="modal-footer">
                <button class="modal-btn modal-btn-cancel">${escapeHtml(options.cancelText || 'Cancel')}</button>
                <button class="modal-btn modal-btn-confirm">${escapeHtml(options.confirmText || 'Confirm')}</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
            overlay.classList.add('active');
            modal.classList.add('active');
        }, 10);
        
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('.modal-btn-cancel');
        const confirmBtn = modal.querySelector('.modal-btn-confirm');
        const modalInput = modal.querySelector('#modalInput');
        
        if (options.showInput && modalInput) {
            setTimeout(() => modalInput.focus(), 100);
            modalInput.select();
        }
        
        function closeModal(result) {
            document.body.style.overflow = '';
            overlay.classList.remove('active');
            modal.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 300);
        }
        
        closeBtn.addEventListener('click', () => closeModal(null));
        cancelBtn.addEventListener('click', () => closeModal(null));
        confirmBtn.addEventListener('click', () => {
            if (options.showInput) {
                closeModal(modalInput ? modalInput.value.trim() : '');
            } else {
                closeModal(true);
            }
        });
        
        if (options.showInput && modalInput) {
            modalInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    closeModal(modalInput.value.trim());
                }
            });
        }
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(null);
        });
    });
}

function showConfirm(message) {
    return showModal({
        title: '⚠️ Confirm Action',
        message: message,
        confirmText: 'Yes, Delete',
        cancelText: 'Cancel',
        showInput: false
    });
}

function showEditDialog(currentText) {
    return showModal({
        title: '✏️ Edit Task',
        message: 'Modify your task below:',
        inputValue: currentText,
        confirmText: 'Save Changes',
        cancelText: 'Cancel',
        showInput: true
    });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function showToast(message, duration = 2500, type = 'info') {
    toastEl.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info');
    
    if (type === 'success') toastEl.classList.add('toast-success');
    if (type === 'error') toastEl.classList.add('toast-error');
    if (type === 'warning') toastEl.classList.add('toast-warning');
    if (type === 'info') toastEl.classList.add('toast-info');
    
    toastEl.textContent = message;
    toastEl.classList.add('show');
    
    setTimeout(() => {
        toastEl.classList.remove('show');
        toastEl.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info');
    }, duration);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function extractPriorityFromText(rawText) {
    let priority = 'medium';
    let cleanText = rawText;
    const lowerText = rawText.toLowerCase();
    
    if (lowerText.includes('[high]') || lowerText.includes('(high)') || lowerText.includes('!high') || lowerText.includes('#high')) {
        priority = 'high';
        cleanText = cleanText.replace(/\[high\]|\(high\)|\!high|#high/gi, '').trim();
    } else if (lowerText.includes('[medium]') || lowerText.includes('(medium)') || lowerText.includes('!medium') || lowerText.includes('#medium')) {
        priority = 'medium';
        cleanText = cleanText.replace(/\[medium\]|\(medium\)|\!medium|#medium/gi, '').trim();
    } else if (lowerText.includes('[low]') || lowerText.includes('(low)') || lowerText.includes('!low') || lowerText.includes('#low')) {
        priority = 'low';
        cleanText = cleanText.replace(/\[low\]|\(low\)|\!low|#low/gi, '').trim();
    }
    
    if (cleanText) {
        cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
    }
    
    return { cleanText, priority };
}

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const rate = total === 0 ? 0 : Math.round((completed / total) * 100);
    
    totalTasksEl.textContent = total;
    pendingTasksEl.textContent = pending;
    completedTasksEl.textContent = completed;
    completionRateEl.textContent = `${rate}%`;
}

// ========================================
// API CALLS
// ========================================

async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE_URL}/tasks`);
        if (!response.ok) throw new Error('Failed to load tasks');
        tasks = await response.json();
        renderTasks();
        showToast(`📋 Loaded ${tasks.length} tasks`, 1500, 'success');
    } catch (error) {
        console.error('Load error:', error);
        showToast('❌ Cannot connect to backend. Make sure server is running on port 3000', 4000, 'error');
        tasks = [];
        renderTasks();
    }
}

async function addTask() {
    let rawText = taskInput.value.trim();
    if (!rawText) {
        showToast('⚠️ Please enter a task', 1500, 'warning');
        taskInput.focus();
        return;
    }
    
    const { cleanText, priority } = extractPriorityFromText(rawText);
    if (!cleanText) {
        showToast('⚠️ Please provide a valid task name', 1500, 'warning');
        return;
    }
    
    const originalText = addBtn.innerHTML;
    addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    addBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText, priority })
        });
        
        if (!response.ok) throw new Error('Failed to add task');
        
        const newTask = await response.json();
        tasks.unshift(newTask);
        renderTasks();
        taskInput.value = '';
        showToast(`✅ Task added: ${cleanText.substring(0, 40)}`, 1800, 'success');
        taskInput.focus();
        
        emitTaskUpdate('create', newTask);
        
    } catch (error) {
        console.error('Add error:', error);
        showToast(`❌ ${error.message || 'Failed to add task'}`, 2000, 'error');
    } finally {
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Task';
        addBtn.disabled = false;
    }
}

async function toggleComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: !task.completed })
        });
        
        if (!response.ok) throw new Error('Failed to update');
        
        const updatedTask = await response.json();
        const index = tasks.findIndex(t => t.id === taskId);
        tasks[index] = updatedTask;
        renderTasks();
        
        const status = updatedTask.completed ? 'completed' : 'pending';
        showToast(`📌 Task marked as ${status}`, 1200, 'success');
        
        emitTaskUpdate('update', updatedTask);
        
    } catch (error) {
        console.error('Toggle error:', error);
        showToast('❌ Failed to update task status', 1500, 'error');
    }
}

async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const confirmed = await showConfirm(`Are you sure you want to delete "${task.text.substring(0, 50)}"?`);
    if (!confirmed) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete');
        
        const index = tasks.findIndex(t => t.id === taskId);
        tasks.splice(index, 1);
        renderTasks();
        showToast(`🗑️ Task deleted`, 1600, 'success');
        
        emitTaskUpdate('delete', { id: taskId, task: task });
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast('❌ Failed to delete task', 1500, 'error');
    }
}

async function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newText = await showEditDialog(task.text);
    if (newText === null) return;
    
    if (!newText || newText.trim() === '') {
        showToast('⚠️ Task cannot be empty', 1200, 'warning');
        return;
    }
    
    const { cleanText, priority } = extractPriorityFromText(newText.trim());
    if (!cleanText) {
        showToast('⚠️ Please provide a valid task name', 1200, 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText, priority })
        });
        
        if (!response.ok) throw new Error('Failed to update');
        
        const updatedTask = await response.json();
        const index = tasks.findIndex(t => t.id === taskId);
        tasks[index] = updatedTask;
        renderTasks();
        showToast('✏️ Task updated successfully', 1400, 'success');
        
        emitTaskUpdate('update', updatedTask);
        
    } catch (error) {
        console.error('Edit error:', error);
        showToast('❌ Failed to update task', 1500, 'error');
    }
}

async function cyclePriority(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const priorityOrder = ['low', 'medium', 'high'];
    const currentIndex = priorityOrder.indexOf(task.priority);
    const nextIndex = (currentIndex + 1) % priorityOrder.length;
    const newPriority = priorityOrder[nextIndex];
    
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: newPriority })
        });
        
        if (!response.ok) throw new Error('Failed to update priority');
        
        const updatedTask = await response.json();
        const index = tasks.findIndex(t => t.id === taskId);
        tasks[index] = updatedTask;
        renderTasks();
        
        const priorityNames = { low: 'Low', medium: 'Medium', high: 'High' };
        showToast(`🎯 Priority changed to ${priorityNames[newPriority]}`, 1300, 'success');
        
        emitTaskUpdate('update', updatedTask);
        
    } catch (error) {
        console.error('Priority error:', error);
        showToast('❌ Failed to update priority', 1500, 'error');
    }
}

async function clearAllTasks() {
    if (tasks.length === 0) {
        showToast('No tasks to clear', 1000, 'warning');
        return;
    }
    
    const confirmed = await showConfirm('⚠️ Permanently delete ALL tasks?\n\nThis action cannot be undone.');
    if (!confirmed) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/tasks`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to clear tasks');
        
        tasks = [];
        renderTasks();
        showToast('🧹 All tasks cleared', 1700, 'success');
        
        emitTaskUpdate('clear', { message: 'All tasks cleared' });
        
    } catch (error) {
        console.error('Clear error:', error);
        showToast('❌ Failed to clear tasks', 1500, 'error');
    }
}

// ========================================
// RENDERING
// ========================================

function renderTasks() {
    let filteredTasks = [...tasks];
    if (currentFilter === 'pending') filteredTasks = filteredTasks.filter(t => !t.completed);
    if (currentFilter === 'completed') filteredTasks = filteredTasks.filter(t => t.completed);
    
    updateStats();
    
    if (filteredTasks.length === 0) {
        const messages = {
            all: { icon: '📋', text: 'No tasks to display' },
            pending: { icon: '🏆', text: 'All caught up! No pending tasks.' },
            completed: { icon: '💪', text: 'No completed tasks yet. Get started!' }
        };
        const msg = messages[currentFilter] || messages.all;
        taskListEl.innerHTML = `<div class="empty-state"><span class="empty-state-icon">${msg.icon}</span><p>${msg.text}</p></div>`;
        return;
    }
    
    taskListEl.innerHTML = filteredTasks.map(task => {
        const priorityIcons = { high: '🔴', medium: '🟠', low: '🟢' };
        const priorityClass = `priority-${task.priority}`;
        
        return `
            <li class="task-item ${task.completed ? 'completed-task' : ''}" data-id="${task.id}">
                <div class="task-main">
                    <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''} data-id="${task.id}">
                    <div class="task-content">
                        <div class="task-text">${escapeHtml(task.text)}</div>
                        <div class="task-timestamps">
                            <span class="timestamp">📅 Created: ${task.createdatformatted || 'Just now'}</span>
                            ${task.completedatformatted ? `<span class="timestamp">✅ Completed: ${task.completedatformatted}</span>` : ''}
                        </div>
                    </div>
                    <div class="task-priority">
                        <span class="priority-badge ${priorityClass}">${priorityIcons[task.priority]} ${task.priority.toUpperCase()}</span>
                    </div>
                    <div class="task-actions">
                        <button class="priority-btn" data-id="${task.id}" title="Change priority">🏷️</button>
                        <button class="edit-btn" data-id="${task.id}" title="Edit task">✏️</button>
                        <button class="delete-btn" data-id="${task.id}" title="Delete task">🗑️</button>
                    </div>
                </div>
            </li>
        `;
    }).join('');
    
    attachEventListeners();
}

function attachEventListeners() {
    document.querySelectorAll('.task-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleComplete(parseInt(cb.dataset.id));
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteTask(parseInt(btn.dataset.id));
        });
    });
    
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await editTask(parseInt(btn.dataset.id));
        });
    });
    
    document.querySelectorAll('.priority-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            cyclePriority(parseInt(btn.dataset.id));
        });
    });
}

function setFilter(filter) {
    currentFilter = filter;
    filterBtns.forEach(btn => {
        if (btn.dataset.filter === filter) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    renderTasks();
    showToast(`Filter: ${filter === 'all' ? 'All tasks' : filter === 'pending' ? 'Pending only' : 'Completed only'}`, 1000, 'info');
}

// ========================================
// INITIALIZATION
// ========================================

function initEventListeners() {
    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });
    filterBtns.forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
    clearAllBtn.addEventListener('click', clearAllTasks);
}

async function init() {
    initEventListeners();
    setFilter('all');
    await loadTasks();
    initSocket();
    taskInput.focus();
}

// Start the application
init();