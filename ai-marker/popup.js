async function render(keyword = "") {

  const { marks = [] } =
    await chrome.storage.local.get("marks");

  const list =
    document.getElementById("list");

  list.innerHTML = "";

  marks
    .filter(m =>
      m.snippet
       .toLowerCase()
       .includes(keyword.toLowerCase())
    )
    .forEach(m => {

      const div =
        document.createElement("div");

      div.innerHTML = `
        <div class="item">
          <div class="snippet">${m.snippet}</div>
          <small>${m.time}</small>
          <div>
            <button class="go">跳转</button>
            <button class="del">删除</button>
          </div>
        </div>
        <hr/>
      `;

      div.querySelector(".go")
        .onclick = () => {

        chrome.tabs.create(
          { url: m.url },
          () => {
            chrome.storage.local.set({
              jumpTo: m
            });
          });
      };

      div.querySelector(".del")
        .onclick = async () => {

        const left =
          marks.filter(
            x => x.id !== m.id
          );

        await chrome.storage.local.set({
          marks: left
        });

        render(keyword);
      };

      list.appendChild(div);
    });
}

document.getElementById("search")
  .oninput = e =>
    render(e.target.value);

render();
