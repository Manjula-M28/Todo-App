const express = require("express");
const mysql = require('mysql2');
const app = express();

// ========== MySQL CONNECTION SETUP ==========
// ========== CORRECT MySQL CONNECTION ==========
const pool = mysql.createPool({
    host: 'localhost',        // ✅ Same
    user: 'root',             // ✅ Same
    password: 'Manju@05',      // ✅ Same
    database: 'todoapp',       // ✅ FIXED - 'todoapp' nu podu
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

// ========== MIDDLEWARE ==========
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ========== DATABASE INITIALIZATION ==========
async function initializeDatabase() {
    try {
        // Create database if not exists
        await promisePool.query('CREATE DATABASE IF NOT EXISTS todoapp');
        await promisePool.query('USE todoapp');
        
        // Create todos table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS todos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                text VARCHAR(255) NOT NULL,
                completed BOOLEAN DEFAULT FALSE,
                category ENUM('work', 'personal', 'shopping', 'health') DEFAULT 'personal',
                priority ENUM('high', 'medium', 'low') DEFAULT 'medium',
                dueDate DATE,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Insert sample data if table is empty
        const [rows] = await promisePool.query('SELECT COUNT(*) as count FROM todos');
        if (rows[0].count === 0) {
            const sampleTodos = [
                ['Complete project documentation', 'work', 'high', '2024-02-20'],
                ['Buy groceries for dinner', 'shopping', 'medium', '2024-02-18'],
                ['Morning workout', 'health', 'high', '2024-02-17']
            ];
            
            for (let todo of sampleTodos) {
                await promisePool.query(
                    'INSERT INTO todos (text, category, priority, dueDate) VALUES (?, ?, ?, ?)',
                    todo
                );
            }
            console.log('✅ Sample data inserted');
        }
        
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// Initialize database on startup
initializeDatabase();

// ========== HOME PAGE ==========
app.get("/", async (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const filterCategory = req.query.category || 'all';
        const filterPriority = req.query.priority || 'all';
        const filterStatus = req.query.status || 'all';
        
        // Build query with filters
        let query = 'SELECT * FROM todos WHERE 1=1';
        const queryParams = [];
        
        if (searchTerm) {
            query += ' AND text LIKE ?';
            queryParams.push(`%${searchTerm}%`);
        }
        
        if (filterCategory !== 'all') {
            query += ' AND category = ?';
            queryParams.push(filterCategory);
        }
        
        if (filterPriority !== 'all') {
            query += ' AND priority = ?';
            queryParams.push(filterPriority);
        }
        
        if (filterStatus === 'completed') {
            query += ' AND completed = true';
        } else if (filterStatus === 'pending') {
            query += ' AND completed = false';
        }
        
        query += ' ORDER BY createdAt DESC';
        
        // Get filtered todos
        const [todos] = await promisePool.query(query, queryParams);
        
        // Get statistics
        const [[stats]] = await promisePool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN completed = true THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN completed = false THEN 1 ELSE 0 END) as pending
            FROM todos
        `);
        
        const totalTodos = stats.total || 0;
        const completedTodos = stats.completed || 0;
        const pendingTodos = stats.pending || 0;
        const completionRate = totalTodos ? Math.round((completedTodos / totalTodos) * 100) : 0;

        // Generate todo list HTML
        let list = todos.map(todo => {
            const priorityColor = {
                high: '#ef4444',
                medium: '#f59e0b',
                low: '#3b82f6'
            }[todo.priority];

            const categoryColors = {
                work: '#8b5cf6',
                personal: '#ec4899',
                shopping: '#10b981',
                health: '#f97316'
            }[todo.category] || '#6b7280';

            const dueDate = todo.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : null;
            const isOverdue = dueDate && new Date(dueDate) < new Date() && !todo.completed;
            const dueDateClass = isOverdue ? 'overdue' : '';

            // Format dates for display
            const formattedDueDate = todo.dueDate ? new Date(todo.dueDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            }) : '';
            
            const formattedCreatedAt = new Date(todo.createdAt).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });

            return `
            <li class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
                <div class="todo-content">
                    <div class="todo-header">
                        <span class="todo-text ${todo.completed ? 'completed-text' : ''}">
                            ${todo.text}
                        </span>
                        <div class="todo-badges">
                            <span class="badge priority" style="background: ${priorityColor}20; color: ${priorityColor}">
                                ${todo.priority}
                            </span>
                            <span class="badge category" style="background: ${categoryColors}20; color: ${categoryColors}">
                                ${todo.category}
                            </span>
                        </div>
                    </div>
                    
                    <div class="todo-meta">
                        ${todo.dueDate ? `
                            <span class="due-date ${dueDateClass}">
                                📅 ${formattedDueDate}
                                ${isOverdue ? ' (Overdue)' : ''}
                            </span>
                        ` : ''}
                        <span class="created-at">
                            🕐 ${formattedCreatedAt}
                        </span>
                    </div>
                </div>
                
                <div class="todo-actions">
                    <button class="action-btn toggle-btn" onclick="toggleTodo(${todo.id})" title="${todo.completed ? 'Mark pending' : 'Mark completed'}">
                        ${todo.completed ? '↩️' : '✅'}
                    </button>
                    <button class="action-btn edit-btn" onclick="editTodo(${todo.id})" title="Edit task">
                        ✏️
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteTodo(${todo.id})" title="Delete task">
                        🗑️
                    </button>
                </div>
            </li>
            `;
        }).join('');

        // Send HTML response
        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
            <title>✨ Todo App Pro with MySQL</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                body {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 10px;
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                }

                .container {
                    max-width: 900px;
                    width: 100%;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    padding: 20px;
                    margin: 10px auto;
                }

                h1 {
                    font-size: clamp(1.8rem, 5vw, 2.5rem);
                    font-weight: 700;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                }

                h1 span {
                    font-size: clamp(0.8rem, 3vw, 1rem);
                    background: #e5e7eb;
                    color: #4b5563;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-weight: normal;
                }

                /* Stats Cards */
                .stats-container {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                    margin: 20px 0;
                }

                .stat-card {
                    background: white;
                    padding: 15px 10px;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                    text-align: center;
                    transition: transform 0.2s;
                }

                .stat-card:hover {
                    transform: translateY(-5px);
                }

                .stat-value {
                    font-size: clamp(1.2rem, 4vw, 2rem);
                    font-weight: 700;
                    color: #4f46e5;
                    margin-bottom: 5px;
                }

                .stat-label {
                    color: #6b7280;
                    font-size: clamp(0.7rem, 2vw, 0.9rem);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .progress-bar {
                    grid-column: span 4;
                    height: 8px;
                    background: #e5e7eb;
                    border-radius: 10px;
                    overflow: hidden;
                    margin-top: 5px;
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #4f46e5, #7c3aed);
                    width: ${completionRate}%;
                    transition: width 0.3s;
                    border-radius: 10px;
                }

                /* Add Todo Form */
                .add-todo-form {
                    background: #f9fafb;
                    padding: 20px;
                    border-radius: 15px;
                    margin: 20px 0;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr 1fr auto;
                    gap: 10px;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }

                .form-group label {
                    font-size: clamp(0.7rem, 2vw, 0.85rem);
                    font-weight: 600;
                    color: #4b5563;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .form-group input,
                .form-group select {
                    padding: 10px;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: clamp(0.8rem, 2.5vw, 0.95rem);
                    transition: all 0.2s;
                    background: white;
                    width: 100%;
                }

                .form-group input:focus,
                .form-group select:focus {
                    outline: none;
                    border-color: #4f46e5;
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
                }

                .add-btn {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: clamp(0.8rem, 2.5vw, 1rem);
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                    align-self: flex-end;
                    margin-top: 22px;
                    white-space: nowrap;
                }

                .add-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(79, 70, 229, 0.4);
                }

                /* Filters */
                .filters-section {
                    background: white;
                    padding: 15px;
                    border-radius: 12px;
                    margin: 15px 0;
                }

                .filter-row {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr 1fr;
                    gap: 10px;
                }

                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }

                .filter-group label {
                    font-size: clamp(0.7rem, 2vw, 0.85rem);
                    font-weight: 600;
                    color: #4b5563;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }

                .filter-group input,
                .filter-group select {
                    padding: 8px;
                    border: 2px solid #e5e7eb;
                    border-radius: 6px;
                    font-size: clamp(0.8rem, 2.5vw, 0.9rem);
                    width: 100%;
                }

                /* Todo List */
                .todos-list {
                    margin-top: 20px;
                    list-style: none;
                }

                .todo-item {
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    padding: 15px;
                    margin-bottom: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    transition: all 0.3s;
                    animation: slideIn 0.3s ease;
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .todo-item:hover {
                    border-color: #4f46e5;
                    box-shadow: 0 5px 15px rgba(79, 70, 229, 0.1);
                }

                .todo-item.completed {
                    background: #f9fafb;
                    opacity: 0.8;
                }

                .todo-content {
                    flex: 1;
                    min-width: 0;
                }

                .todo-header {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 8px;
                }

                .todo-text {
                    font-size: clamp(0.9rem, 3vw, 1.1rem);
                    font-weight: 500;
                    color: #1f2937;
                    word-break: break-word;
                }

                .completed-text {
                    text-decoration: line-through;
                    color: #9ca3af;
                }

                .todo-badges {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                }

                .badge {
                    padding: 3px 8px;
                    border-radius: 15px;
                    font-size: clamp(0.65rem, 2vw, 0.8rem);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    white-space: nowrap;
                }

                .todo-meta {
                    display: flex;
                    gap: 15px;
                    font-size: clamp(0.75rem, 2.5vw, 0.9rem);
                    color: #6b7280;
                    flex-wrap: wrap;
                }

                .due-date, .created-at {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    white-space: nowrap;
                }

                .due-date.overdue {
                    color: #ef4444;
                    font-weight: 600;
                }

                .todo-actions {
                    display: flex;
                    gap: 6px;
                    margin-left: 10px;
                }

                .action-btn {
                    width: 36px;
                    height: 36px;
                    border: none;
                    border-radius: 8px;
                    background: #f3f4f6;
                    cursor: pointer;
                    font-size: 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .action-btn:hover {
                    transform: scale(1.1);
                }

                .action-btn:active {
                    transform: scale(0.95);
                }

                .toggle-btn:hover {
                    background: #10b981;
                    color: white;
                }

                .edit-btn:hover {
                    background: #f59e0b;
                    color: white;
                }

                .delete-btn:hover {
                    background: #ef4444;
                    color: white;
                }

                /* Edit Modal */
                .modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(5px);
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                    padding: 15px;
                }

                .modal.active {
                    display: flex;
                }

                .modal-content {
                    background: white;
                    padding: 25px;
                    border-radius: 20px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow-y: auto;
                    animation: slideIn 0.3s ease;
                }

                .modal h2 {
                    margin-bottom: 20px;
                    color: #1f2937;
                    font-size: clamp(1.2rem, 4vw, 1.5rem);
                }

                .modal .form-group {
                    margin-bottom: 15px;
                }

                .modal-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    margin-top: 20px;
                    flex-wrap: wrap;
                }

                .modal-btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: clamp(0.8rem, 2.5vw, 1rem);
                    flex: 1;
                    min-width: 120px;
                }

                .save-btn {
                    background: #4f46e5;
                    color: white;
                }

                .save-btn:hover {
                    background: #4338ca;
                }

                .cancel-btn {
                    background: #e5e7eb;
                    color: #4b5563;
                }

                .cancel-btn:hover {
                    background: #d1d5db;
                }

                .empty-state {
                    text-align: center;
                    padding: 40px 20px;
                    color: #9ca3af;
                    font-size: clamp(0.9rem, 3vw, 1.1rem);
                }

                /* Mobile Responsive */
                @media screen and (max-width: 768px) {
                    body {
                        padding: 5px;
                    }

                    .container {
                        padding: 12px;
                    }

                    .stats-container {
                        grid-template-columns: repeat(2, 1fr);
                    }

                    .progress-bar {
                        grid-column: span 2;
                    }

                    .form-row {
                        grid-template-columns: 1fr;
                    }

                    .add-btn {
                        margin-top: 5px;
                        width: 100%;
                    }

                    .filter-row {
                        grid-template-columns: 1fr;
                    }

                    .todo-item {
                        flex-direction: column;
                    }

                    .todo-actions {
                        width: 100%;
                        justify-content: space-around;
                        margin-left: 0;
                        margin-top: 10px;
                    }

                    .action-btn {
                        flex: 1;
                        height: 44px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>
                    ✨ Todo App Pro with MySQL
                    <span>Persistent Storage</span>
                </h1>

                <!-- Stats -->
                <div class="stats-container">
                    <div class="stat-card">
                        <div class="stat-value">${totalTodos}</div>
                        <div class="stat-label">Total Tasks</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${completedTodos}</div>
                        <div class="stat-label">Completed</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${pendingTodos}</div>
                        <div class="stat-label">Pending</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${completionRate}%</div>
                        <div class="stat-label">Progress</div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                </div>

                <!-- Add Todo Form -->
                <div class="add-todo-form">
                    <form action="/add" method="POST" id="addForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label>📝 Task Description</label>
                                <input type="text" name="text" placeholder="Enter your task..." required>
                            </div>
                            <div class="form-group">
                                <label>📂 Category</label>
                                <select name="category" required>
                                    <option value="work">💼 Work</option>
                                    <option value="personal">👤 Personal</option>
                                    <option value="shopping">🛒 Shopping</option>
                                    <option value="health">🏃 Health</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>⚡ Priority</label>
                                <select name="priority" required>
                                    <option value="high">🔴 High</option>
                                    <option value="medium">🟡 Medium</option>
                                    <option value="low">🔵 Low</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>📅 Due Date</label>
                                <input type="date" name="dueDate" required>
                            </div>
                            <button type="submit" class="add-btn">➕ Add Task</button>
                        </div>
                    </form>
                </div>

                <!-- Filters -->
                <div class="filters-section">
                    <form action="/" method="GET" id="filterForm">
                        <div class="filter-row">
                            <div class="filter-group">
                                <label>🔍 Search</label>
                                <input type="text" name="search" placeholder="Search tasks..." value="${searchTerm}">
                            </div>
                            <div class="filter-group">
                                <label>📂 Category</label>
                                <select name="category">
                                    <option value="all">All Categories</option>
                                    <option value="work" ${filterCategory === 'work' ? 'selected' : ''}>Work</option>
                                    <option value="personal" ${filterCategory === 'personal' ? 'selected' : ''}>Personal</option>
                                    <option value="shopping" ${filterCategory === 'shopping' ? 'selected' : ''}>Shopping</option>
                                    <option value="health" ${filterCategory === 'health' ? 'selected' : ''}>Health</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>⚡ Priority</label>
                                <select name="priority">
                                    <option value="all">All Priorities</option>
                                    <option value="high" ${filterPriority === 'high' ? 'selected' : ''}>High</option>
                                    <option value="medium" ${filterPriority === 'medium' ? 'selected' : ''}>Medium</option>
                                    <option value="low" ${filterPriority === 'low' ? 'selected' : ''}>Low</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>📊 Status</label>
                                <select name="status">
                                    <option value="all">All Tasks</option>
                                    <option value="completed" ${filterStatus === 'completed' ? 'selected' : ''}>Completed</option>
                                    <option value="pending" ${filterStatus === 'pending' ? 'selected' : ''}>Pending</option>
                                </select>
                            </div>
                        </div>
                    </form>
                </div>

                <!-- Todo List -->
                <ul class="todos-list">
                    ${list || '<li class="empty-state">✨ No tasks found. Add a new task to get started!</li>'}
                </ul>
            </div>

            <!-- Edit Modal -->
            <div class="modal" id="editModal">
                <div class="modal-content">
                    <h2>✏️ Edit Task</h2>
                    <form id="editForm" method="POST">
                        <div class="form-group">
                            <label>Task Description</label>
                            <input type="text" name="text" id="editText" required>
                        </div>
                        <div class="form-group">
                            <label>Category</label>
                            <select name="category" id="editCategory" required>
                                <option value="work">💼 Work</option>
                                <option value="personal">👤 Personal</option>
                                <option value="shopping">🛒 Shopping</option>
                                <option value="health">🏃 Health</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Priority</label>
                            <select name="priority" id="editPriority" required>
                                <option value="high">🔴 High</option>
                                <option value="medium">🟡 Medium</option>
                                <option value="low">🔵 Low</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="date" name="dueDate" id="editDueDate" required>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="modal-btn cancel-btn" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="modal-btn save-btn">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
                // Auto-submit filters when changed
                document.querySelectorAll('#filterForm select, #filterForm input').forEach(field => {
                    field.addEventListener('change', () => {
                        document.getElementById('filterForm').submit();
                    });
                    if (field.type === 'text') {
                        let timeout;
                        field.addEventListener('input', () => {
                            clearTimeout(timeout);
                            timeout = setTimeout(() => {
                                document.getElementById('filterForm').submit();
                            }, 500);
                        });
                    }
                });

                // Modal functions
                function openModal() {
                    document.getElementById('editModal').classList.add('active');
                    document.body.style.overflow = 'hidden';
                }

                function closeModal() {
                    document.getElementById('editModal').classList.remove('active');
                    document.body.style.overflow = '';
                }

                // Toggle todo
                function toggleTodo(id) {
                    fetch('/toggle/' + id, { method: 'POST' })
                        .then(() => window.location.reload())
                        .catch(err => console.error('Error:', err));
                }

                // Edit todo
                function editTodo(id) {
                    fetch('/todo/' + id)
                        .then(res => res.json())
                        .then(todo => {
                            document.getElementById('editText').value = todo.text;
                            document.getElementById('editCategory').value = todo.category;
                            document.getElementById('editPriority').value = todo.priority;
                            document.getElementById('editDueDate').value = todo.dueDate.split('T')[0];
                            document.getElementById('editForm').action = '/update/' + id;
                            openModal();
                        })
                        .catch(err => console.error('Error:', err));
                }

                // Delete todo
                function deleteTodo(id) {
                    if (confirm('Are you sure you want to delete this task?')) {
                        fetch('/delete/' + id, { method: 'POST' })
                            .then(() => window.location.reload())
                            .catch(err => console.error('Error:', err));
                    }
                }

                // Close modal when clicking outside
                window.onclick = function(event) {
                    const modal = document.getElementById('editModal');
                    if (event.target === modal) {
                        closeModal();
                    }
                }

                // Close modal with escape key
                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && document.getElementById('editModal').classList.contains('active')) {
                        closeModal();
                    }
                });
            </script>
        </body>
        </html>
        `);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).send('Database error occurred');
    }
});

// ========== ADD TODO ==========
app.post("/add", async (req, res) => {
    try {
        const { text, category, priority, dueDate } = req.body;
        
        if (!text || !category || !priority || !dueDate) {
            return res.redirect("/");
        }
        
        const query = 'INSERT INTO todos (text, category, priority, dueDate) VALUES (?, ?, ?, ?)';
        await promisePool.query(query, [text, category, priority, dueDate]);
        
        res.redirect("/");
    } catch (error) {
        console.error('Error adding todo:', error);
        res.redirect("/");
    }
});

// ========== GET SINGLE TODO ==========
app.get("/todo/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const [rows] = await promisePool.query('SELECT * FROM todos WHERE id = ?', [id]);
        
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: "Todo not found" });
        }
    } catch (error) {
        res.status(500).json({ error: "Database error" });
    }
});

// ========== TOGGLE TODO ==========
app.post("/toggle/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await promisePool.query(
            'UPDATE todos SET completed = NOT completed WHERE id = ?',
            [id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Database error" });
    }
});

// ========== UPDATE TODO ==========
app.post("/update/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { text, category, priority, dueDate } = req.body;
        
        await promisePool.query(
            'UPDATE todos SET text = ?, category = ?, priority = ?, dueDate = ? WHERE id = ?',
            [text, category, priority, dueDate, id]
        );
        
        res.redirect("/");
    } catch (error) {
        console.error('Error updating todo:', error);
        res.redirect("/");
    }
});

// ========== DELETE TODO ==========
app.post("/delete/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await promisePool.query('DELETE FROM todos WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Database error" });
    }
});

// ========== TEST DATABASE CONNECTION ==========
app.get("/test-db", async (req, res) => {
    try {
        const [result] = await promisePool.query('SELECT 1+1 as result');
        res.json({ 
            message: '✅ Database connected successfully!', 
            result: result[0].result,
            database: 'todoapp'
        });
    } catch (error) {
        res.status(500).json({ 
            error: '❌ Database connection failed',
            details: error.message 
        });
    }
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3500;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ====================================
    🚀 Todo App Pro with MySQL is running!
    ====================================
    📍 Local: http://localhost:${PORT}
    📍 Network: http://YOUR_IP:${PORT}
    
    ✅ Features:
    • MySQL Persistent Storage
    • Full CRUD Operations
    • Categories & Priority
    • Live Search & Filters
    • Mobile Responsive
    • Statistics Dashboard
    
    ✅ Database: todoapp
    ✅ Table: todos
    
    ⚡ Test DB: http://localhost:${PORT}/test-db
    ====================================
    `);
});