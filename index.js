const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));

// Todos array
let todos = [];

// ----------- Home Page -----------
app.get("/", (req, res) => {
  let list = todos.map((t, i) => `
    <li>
      <span style="text-decoration: ${t.completed ? 'line-through' : 'none'};">
        ${t.text} [${t.completed ? 'Completed' : 'Pending'}]
      </span>
      <div class="actions">
        <a class="toggle" href="/toggle/${i}">${t.completed ? 'Mark Pending' : 'Mark Completed'}</a>
        <a class="edit" href="/edit/${i}">Edit</a>
        <a class="delete" href="/delete/${i}">Delete</a>
      </div>
    </li>
  `).join("");

  res.send(`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Todo App with Status</title>
    <style>
      body{font-family:Arial; background:#0f172a; color:#e5e7eb; display:flex; justify-content:center; align-items:center; min-height:100vh;}
      .container{background:#111827; padding:25px; border-radius:15px; width:90%; max-width:400px;}
      h1{color:#38bdf8; text-align:center; margin-bottom:20px;}
      form{display:flex; gap:8px; margin-bottom:20px;}
      input{flex:1;padding:10px;border-radius:8px;border:none;outline:none;background:#020617;color:#e5e7eb;}
      button{padding:10px 15px;border:none;border-radius:8px;background:#38bdf8;color:#020617;font-weight:bold;cursor:pointer;}
      ul{list-style:none;}
      li{display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:#020617;border-radius:8px;}
      li:hover{background:#1f2937;}
      .actions a{margin-left:6px;padding:4px 8px;border-radius:6px;text-decoration:none;font-size:13px;}
      .edit{background:#22c55e;color:#052e16;}
      .delete{background:#ef4444;color:#450a0a;}
      .toggle{background:#facc15;color:#020617;}
      .edit:hover,.delete:hover,.toggle:hover{opacity:0.8;}
    </style>
  </head>
  <body>
    <div class="container">
      <h1>✅ Todo App</h1>
      <form action="/add" method="POST">
        <input type="text" name="task" placeholder="Enter your task" required>
        <button>Add</button>
      </form>
      <ul>${list}</ul>
    </div>
  </body>
  </html>
  `);
});

// ----------- Add Todo -----------
app.post("/add", (req, res) => {
  todos.push({ text: req.body.task, completed: false });
  res.redirect("/");
});

// ----------- Toggle Completed -----------
app.get("/toggle/:id", (req, res) => {
  const id = req.params.id;
  if (todos[id]) {  // <-- safety check
    todos[id].completed = !todos[id].completed;
  }
  res.redirect("/");
});

// ----------- Edit Todo -----------
app.get("/edit/:id", (req, res) => {
  const id = req.params.id;
  if (todos[id]) {  // <-- safety check
    const task = todos[id].text;
    res.send(`
      <form action="/update/${id}" method="POST">
        <input name="task" value="${task}" required>
        <button>Update</button>
      </form>
    `);
  } else {
    res.redirect("/");
  }
});

// ----------- Update Todo -----------
app.post("/update/:id", (req, res) => {
  const id = req.params.id;
  if (todos[id]) {  // <-- safety check
    todos[id].text = req.body.task;
  }
  res.redirect("/");
});

// ----------- Delete Todo -----------
app.get("/delete/:id", (req, res) => {
  const id = req.params.id;
  if (todos[id]) {  // <-- safety check
    todos.splice(id, 1);
  }
  res.redirect("/");
});

// ----------- Start App -----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Todo App running on port ${PORT}`));