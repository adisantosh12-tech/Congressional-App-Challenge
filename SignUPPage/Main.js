let groups = [];
    let currentUser = null;
    let chats = JSON.parse(localStorage.getItem("studyBridgeChats") || "{}");
    let currentChatGroup = null;
    let signup = true;
    let groupSyncTimer = null;
    let teachBackTopic = "";
    let teachBackHistory = [];
    let teachBackBusy = false;

    const groupsApi = "/api/groups";

    /*
      Demo-only storage.
      A real app needs a backend, database, server-side session handling,
      and salted password hashing. Local storage is not secure for passwords.
    */
    let accounts = JSON.parse(localStorage.getItem("studyBridgeAccounts") || "{}");

    function saveAccounts() {
      localStorage.setItem("studyBridgeAccounts", JSON.stringify(accounts));
    }

    function saveGroups() {
      localStorage.setItem("studyBridgeGroups", JSON.stringify(groups));

      fetch(groupsApi, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(groups)
      }).catch(() => {
        /* Local storage remains the offline fallback. */
      });
    }

    async function loadGroups() {
      try {
        const response = await fetch(groupsApi, {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Groups API unavailable");
        }

        const sharedGroups = await response.json();

        groups = Array.isArray(sharedGroups) ? sharedGroups : [];

        localStorage.setItem("studyBridgeGroups", JSON.stringify(groups));
      } catch (error) {
        groups = JSON.parse(localStorage.getItem("studyBridgeGroups") || "[]");
      }
    }

    function saveChats() {
      localStorage.setItem("studyBridgeChats", JSON.stringify(chats));
    }

    function toggleAuth() {
      signup = !signup;

      document.getElementById("authSubtitle").textContent =
        signup ? "Create an Account" : "Welcome Back";

      document.getElementById("authButton").textContent =
        signup ? "Sign Up" : "Sign In";

      document.getElementById("password").placeholder =
        signup ? "Create Password" : "Password";

      document.getElementById("password").autocomplete =
        signup ? "new-password" : "current-password";

      document.getElementById("confirmWrap").style.display =
        signup ? "block" : "none";

      document.getElementById("authToggle").textContent =
        signup
          ? "Already have an account? Sign In"
          : "New to Study Bridge? Sign Up";

      document.getElementById("authError").textContent = "";

      const googleButton = document.querySelector(".g_id_signin");

      if (
        googleButton &&
        window.google &&
        google.accounts &&
        google.accounts.id
      ) {
       google.accounts.id.renderButton(googleButton, {
  type: "standard",
  theme: "outline",
  size: "large",
  shape: "pill",
  text: signup ? "signup_with" : "signin_with",
  logo_alignment: "left",
  width: 340
});
      }
    }

    document.getElementById("authToggle").addEventListener("click", toggleAuth);

    function handleCredentialResponse(response) {
      /*
        This receives the Google ID token.
        For real production authentication, send this token to a secure backend
        and verify it there before trusting it.
      */
      try {
        const base64Payload = response.credential
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/");

        const payload = JSON.parse(atob(base64Payload));

        currentUser = {
          username: payload.name || payload.email || "Google Student",
          grade: "",
          school: "",
          subjects: "",
          goals: "",
          provider: "google",
          email: payload.email || ""
        };

        document.getElementById("authScreen").style.display = "none";
        enterApp();
      } catch (error) {
        document.getElementById("authError").style.color = "#d32f2f";
        document.getElementById("authError").textContent =
          "Google sign-in could not be completed. Please try again.";
      }
    }

    document.getElementById("authForm").addEventListener("submit", event => {
      event.preventDefault();

      const error = document.getElementById("authError");
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value;
      const confirm = document.getElementById("confirm").value;

      error.style.color = "#d32f2f";
      error.textContent = "";

      if (!username) {
        error.textContent = "Enter a username.";
        return;
      }

      if (signup) {
        const hasMinimumLength = password.length >= 8;
        const hasCapitalLetter = /[A-Z]/.test(password);
        const hasSpecialSymbol = /[^A-Za-z0-9]/.test(password);

        if (!hasMinimumLength || !hasCapitalLetter || !hasSpecialSymbol) {
          error.textContent =
            "Password must be at least 8 characters and include one capital letter and one special symbol.";
          return;
        }

        if (password !== confirm) {
          error.textContent = "Passwords do not match.";
          return;
        }

        if (accounts[username]) {
          error.textContent = "That username is already taken. Please sign in instead.";
          return;
        }

        accounts[username] = {
          password: password,
          profile: {
            username: username,
            grade: "",
            school: "",
            subjects: "",
            goals: ""
          }
        };

        saveAccounts();

        currentUser = {
          ...accounts[username].profile
        };

        document.getElementById("authScreen").style.display = "none";
        document.getElementById("onboardingScreen").style.display = "flex";
        document.getElementById("onboardingForm").reset();
        document.getElementById("onboardingError").textContent = "";

        return;
      }

      const account = accounts[username];

      if (!account || account.password !== password) {
        error.textContent = "Incorrect username or password.";
        return;
      }

      currentUser = {
        ...account.profile
      };

      enterApp();
    });

    document.getElementById("onboardingForm").addEventListener("submit", event => {
      event.preventDefault();

      const error = document.getElementById("onboardingError");
      const grade = document.getElementById("onboardingGrade").value;
      const subjects = document.getElementById("onboardingSubjects").value.trim();
      const school = document.getElementById("onboardingSchool").value.trim();
      const goals = document.getElementById("onboardingGoals").value.trim();

      error.textContent = "";

      if (!grade) {
        error.textContent = "Please select your grade.";
        return;
      }

      if (!subjects) {
        error.textContent = "Please enter at least one favorite subject.";
        return;
      }

      currentUser.grade = grade;
      currentUser.subjects = subjects;
      currentUser.school = school;
      currentUser.goals = goals;

      accounts[currentUser.username].profile = {
        ...currentUser
      };

      saveAccounts();

      document.getElementById("onboardingScreen").style.display = "none";

      enterApp();
    });

    async function enterApp() {
      document.getElementById("authScreen").style.display = "none";
      document.getElementById("onboardingScreen").style.display = "none";
      document.getElementById("app").classList.add("show");

      setupProfile();

      await loadGroups();

      renderAll();
      showPage("home");

      clearInterval(groupSyncTimer);

      groupSyncTimer = setInterval(async () => {
        await loadGroups();
        renderAll();
      }, 10000);
    }

    function setupProfile() {
      const username = currentUser.username || "Student";
      const letter = username.charAt(0).toUpperCase();

      document.getElementById("topAvatar").textContent = letter;
      document.getElementById("profileAvatar").textContent = letter;
      document.getElementById("profileName").textContent = username;
      document.getElementById("profileUser").textContent = "@" + username;
      document.getElementById("welcome").textContent =
        "Welcome back, " + username + "!";

      document.getElementById("grade").value =
        currentUser.grade || "9th Grade";

      document.getElementById("school").value =
        currentUser.school || "";

      document.getElementById("subjects").value =
        currentUser.subjects || "";

      document.getElementById("goals").value =
        currentUser.goals || "";

      const goal = currentUser.goals || "";
      const hasGoal = goal.trim().length > 0;

      document.getElementById("goalText").textContent =
        goal || "Set a study goal in your profile.";

      document.getElementById("goalProgress").style.width =
        hasGoal ? "100%" : "0%";

      document.getElementById("goalPercent").textContent =
        hasGoal ? "Goal set" : "0% complete";
    }

    function saveProfile() {
      currentUser.grade = document.getElementById("grade").value;
      currentUser.school = document.getElementById("school").value.trim();
      currentUser.subjects = document.getElementById("subjects").value.trim();
      currentUser.goals = document.getElementById("goals").value.trim();
      currentUser.teachingSubjects = document.getElementById("teachingSubjects").value.trim();
      currentUser.availability = document.getElementById("availability").value.trim();
      currentUser.communicationPreference = document.getElementById("communicationPreference").value;
      currentUser.role = document.getElementById("accountRole").value;
      currentUser.aboutMe = document.getElementById("aboutMe").value.trim();

      if (accounts[currentUser.username]) {
        accounts[currentUser.username].profile = {
          ...currentUser
        };

        saveAccounts();
      }

      setupProfile();
      renderHomeStats();

      toast("Profile saved!");
    }
function deleteAccount() {
  if (!currentUser) return;

  const username = currentUser.username;

  const confirmed = window.confirm(
    `Delete the account for "${username}"? This will remove your local profile, cookie progress, Help Board posts, groups you own, and local messages. This cannot be undone.`
  );

  if (!confirmed) return;

  const verification = window.prompt(
    `Type DELETE to permanently delete "${username}".`
  );

  if (verification !== "DELETE") {
    toast("Account deletion cancelled.");
    return;
  }

  const ownedGroupIds = groups
    .filter(group => group.owner === username)
    .map(group => group.id);

  /* Delete groups owned by this user. */
  groups = groups.filter(group => group.owner !== username);

  /* Remove the user from groups they do not own. */
  groups.forEach(group => {
    group.memberUsernames = (group.memberUsernames || []).filter(
      member => member !== username
    );

    group.joinRequests = (group.joinRequests || []).filter(
      member => member !== username
    );

    group.members = Array.isArray(group.memberUsernames)
      ? group.memberUsernames.length
      : group.members;
  });

  /* Delete chats belonging to groups the user owned. */
  ownedGroupIds.forEach(groupId => {
    delete chats[groupId];
  });

  /* Remove the user's messages from remaining chats. */
  Object.keys(chats).forEach(groupId => {
    chats[groupId] = (chats[groupId] || []).filter(
      message => message.sender !== username
    );
  });

  /* dlete thehelpboardposts   ated by the user. */
  if (typeof helpPosts !== "undefined") {
    helpPosts = helpPosts.filter(post => post.author !== username);
    saveHelpPosts();
  }

  /* Remove the account and save all changed local data. */
  delete accounts[username];
  saveAccounts();
  saveGroups();
  saveChats();

  
  currentUser = null;
  currentChatGroup = null;

  clearInterval(groupSyncTimer);

  document.getElementById("app").classList.remove("show");
  document.getElementById("onboardingScreen").style.display = "none";
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("authForm").reset();
  document.getElementById("authError").textContent = "";

  if (!signup) {
    toggleAuth();
  }

  setTimeout(() => {
    alert(
      "Your local StudyBridge account and associated local data were deleted."
    );
  }, 50);
}
    function logout() {
      currentUser = null;
      currentChatGroup = null;

      clearInterval(groupSyncTimer);

      document.getElementById("app").classList.remove("show");
      document.getElementById("onboardingScreen").style.display = "none";
      document.getElementById("authScreen").style.display = "flex";
      document.getElementById("authForm").reset();
      document.getElementById("authError").textContent = "";

      if (!signup) {
        toggleAuth();
      }
    }

    function showPage(id) {
      document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
      });

      document.getElementById(id).classList.add("active");

      document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.page === id);
      });

      if (id === "messages") {
        renderMessages();
      }

      if (id === "home") {
        renderHomeStats();
      }

      window.scrollTo(0, 0);
    }

    document.querySelectorAll(".nav-btn").forEach(button => {
      button.addEventListener("click", () => {
        showPage(button.dataset.page);
      });
    });

    document.getElementById("userPill").addEventListener("click", () => {
      showPage("profile");
    });

    let helpPosts = JSON.parse(localStorage.getItem("studyBridgeHelpPosts") || "[]");
    let helpFilter = "all";
    function saveHelpPosts() { localStorage.setItem("studyBridgeHelpPosts", JSON.stringify(helpPosts)); }
    function generateJoinCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
    function createHelpPost() {
      const type=document.getElementById("helpType").value, subject=document.getElementById("helpSubject").value.trim(), unit=document.getElementById("helpUnit").value.trim(), title=document.getElementById("helpTitle").value.trim(), details=document.getElementById("helpDetails").value.trim(), timing=document.getElementById("helpTiming").value.trim(), goal=document.getElementById("helpGoal").value.trim();
      if (!subject || !title || !details) { toast("Add a subject, title, and details before publishing."); return; }
      helpPosts.unshift({id:Date.now(),type,subject,unit,title,details,timing,goal,author:currentUser.username,replies:[],reports:0,createdAt:new Date().toLocaleDateString()}); saveHelpPosts(); closeModal("helpPostModal"); ["helpSubject","helpUnit","helpTitle","helpDetails","helpTiming","helpGoal"].forEach(id=>document.getElementById(id).value=""); renderHelpBoard(); toast(type==="offer"?"Your offer to help was published.":"Your homework help request was published.");
    }
    function setHelpFilter(filter) { helpFilter=filter; renderHelpBoard(); }
    function replyToHelpPost(postId) { const post=helpPosts.find(item=>item.id===postId); if(!post)return; const reply=window.prompt("Write a helpful reply or offer a time to study:"); if(!reply||!reply.trim())return; post.replies.push({author:currentUser.username,text:reply.trim(),date:new Date().toLocaleDateString()}); saveHelpPosts(); renderHelpBoard(); toast("Your helpful reply was added."); }
    function reportHelpPost(postId) { const post=helpPosts.find(item=>item.id===postId); if(!post)return; post.reports=(post.reports||0)+1; saveHelpPosts(); renderHelpBoard(); toast("Report recorded for demo review."); }
    function deleteHelpPost(postId) {
      const post = helpPosts.find(item => item.id === postId);
      if (!post) { toast("This post could not be found."); return; }
      if (!currentUser || post.author !== currentUser.username) {
        toast("Only the person who created this post can delete it.");
        return;
      }
      if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
      helpPosts = helpPosts.filter(item => item.id !== postId);
      saveHelpPosts();
      renderHelpBoard();
      toast("Post deleted.");
    }

    function helpPostCard(post) { const isRequest=post.type==="request", replyCount=Array.isArray(post.replies)?post.replies.length:0; return `<div class="card help-card"><div class="group-top"><h3>${escapeHtml(post.title)}</h3><span class="tag">${isRequest?"Needs help":"Offers help"}</span></div><div><span class="tag">${escapeHtml(post.subject)}</span>${post.unit?`<span class="tag">${escapeHtml(post.unit)}</span>`:""}</div><p>${escapeHtml(post.details)}</p><div class="help-meta"><span>By ${escapeHtml(post.author)}</span><span>${escapeHtml(post.createdAt||"Today")}</span>${post.timing?`<span>${escapeHtml(post.timing)}</span>`:""}</div>${post.goal?`<p class="group-goal">Goal: ${escapeHtml(post.goal)}</p>`:""}<div class="help-actions"><button class="btn btn-primary btn-sm" onclick="replyToHelpPost(${post.id})">${isRequest?"Offer Help":"Ask for Help"} (${replyCount})</button><button class="btn btn-secondary btn-sm" onclick="reportHelpPost(${post.id})">Report</button>${currentUser && post.author === currentUser.username ? `<button class="btn btn-danger btn-sm" onclick="deleteHelpPost(${post.id})">Delete</button>` : ""}</div></div>`; }
    function renderHelpBoard() { const filtered=helpPosts.filter(post=>helpFilter==="all"||post.type===helpFilter), board=document.getElementById("helpBoardList"), preview=document.getElementById("homeHelpPreview"), empty=emptyState("No posts yet","Post a homework question or offer help in a subject you know.",`<button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="openModal('helpPostModal')">Create a Post</button>`); if(board)board.innerHTML=filtered.length?filtered.map(helpPostCard).join(""):empty; if(preview)preview.innerHTML=helpPosts.length?helpPosts.slice(0,3).map(helpPostCard).join(""):empty; }
    function openClassroomModal() { if(!currentUser||currentUser.role!=="Teacher"){toast("Set your profile role to Teacher / Club Leader first.");showPage("profile");return;} openModal("classroomModal"); }
    function createClassroom() { const name=document.getElementById("classroomName").value.trim(),subject=document.getElementById("classroomSubject").value.trim(),max=Number(document.getElementById("classroomLimit").value)||30,callLink=document.getElementById("classroomCallLink").value.trim(); if(!name||!subject){toast("Add a classroom name and subject.");return;} const group={id:Date.now(),name,subject,topic:"Classroom / Club",time:"Use the class schedule",members:1,max,goal:"Learn and collaborate together",desc:"Teacher-led classroom or club space.",owner:currentUser.username,memberUsernames:[currentUser.username],joinRequests:[],type:"classroom",joinCode:generateJoinCode(),communication:callLink?"Chat + Call":"Chat",callLink,channels:["announcements","general","homework-help","study-materials","call-room"]}; groups.unshift(group);chats[group.id]=[];saveGroups();saveChats();closeModal("classroomModal");["classroomName","classroomSubject","classroomCallLink"].forEach(id=>document.getElementById(id).value="");renderAll();showPage("mygroups");toast(`Classroom created. Join code: ${group.joinCode}`); }

    function renderAll() {
      renderGroups();
      renderMyGroups();
      renderRecommended();
      renderHomeStats();
      renderMessages();
      renderHelpBoard();
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[character];
      });
    }

    function isMember(group) {
      return Array.isArray(group.memberUsernames) &&
        group.memberUsernames.includes(currentUser.username);
    }

    function hasRequested(group) {
      return Array.isArray(group.joinRequests) &&
        group.joinRequests.includes(currentUser.username);
    }

    function isOwner(group) {
      return group.owner === currentUser.username;
    }

    function groupCard(group) {
      const member = isMember(group);

      return `
        <div class="card card-hover group-card" onclick="openGroup(${group.id})">
          <div class="group-top">
            <h3>${escapeHtml(group.name)}</h3>
            <span class="members">👥 ${group.members}/${group.max}</span>
          </div>

          <span class="tag">${escapeHtml(group.subject)}</span>
          <span class="tag">${escapeHtml(group.topic)}</span>

          <p class="group-goal">🎯 ${escapeHtml(group.goal)}</p>
          <p class="group-time">📅 ${escapeHtml(group.time)}</p>
          <p class="group-desc">${escapeHtml(group.desc)}</p>

          <button class="btn btn-primary btn-sm group-btn" onclick="event.stopPropagation();openGroup(${group.id})">
            ${member ? "Open Group" : "View Group"}
          </button>
        </div>
      `;
    }

    function emptyState(title, description, extra = "") {
      return `
        <div class="card" style="grid-column:1/-1">
          <div class="empty-state">
            <h3>${title}</h3>
            <p>${description}</p>
            ${extra}
          </div>
        </div>
      `;
    }

    function renderGroups() {
      const query = (
        document.getElementById("groupSearch").value || ""
      ).toLowerCase();

      const subject =
        document.getElementById("subjectFilter").value || "";

      const filtered = groups.filter(group => {
        const searchable = (
          group.name + " " +
          group.topic + " " +
          group.goal + " " +
          group.desc
        ).toLowerCase();

        return (
          (!query || searchable.includes(query)) &&
          (!subject || group.subject === subject)
        );
      });

      document.getElementById("groupList").innerHTML =
        filtered.map(groupCard).join("") ||
        emptyState(
          "No groups found",
          "Try another search or create a new group."
        );
    }

    function renderMyGroups() {
      const joined = groups.filter(group => isMember(group));

      document.getElementById("myGroupList").innerHTML =
        joined.map(groupCard).join("") ||
        emptyState(
          "No groups yet",
          "Find a group and request to join.",
          `<button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="showPage('groups')">Find Groups</button>`
        );
    }

    function renderRecommended() {
      const recommended = groups
        .filter(group => !isMember(group))
        .slice(0, 3);

      document.getElementById("recommended").innerHTML =
        recommended.length
          ? recommended.map(groupCard).join("")
          : emptyState(
              "No recommendations yet",
              "Create or join a group to see recommendations here."
            );
    }

    function renderHomeStats() {
      const joined = groups.filter(group => isMember(group));

      document.getElementById("groupCount").textContent = joined.length;
    }

    function createGroup() {
      const name = document.getElementById("newName").value.trim();
      const topic = document.getElementById("newTopic").value.trim();
      const description = document.getElementById("newDesc").value.trim();
      function deleteGroup(groupId) {
  const group = groups.find(item => item.id === groupId);

  if (!group) {
    toast("This group could not be found.");
    return;
  }

  if (!isOwner(group)) {
    toast("Only the group owner can delete this group.");
    return;
  }

  const confirmed = window.confirm(
    `Delete "${group.name}"? This cannot be undone. All join requests and local group messages will be removed.`
  );

  if (!confirmed) {
    return;
  }

  groups = groups.filter(item => item.id !== groupId);

  delete chats[groupId];

  if (currentChatGroup === groupId) {
    currentChatGroup = null;
  }

  saveGroups();
  saveChats();

  closeModal("groupModal");
  renderAll();
  showPage("groups");

  toast("Study group deleted.");
}

      if (!name || !topic) {
        toast("Add a group name and topic.");
        return;
      }

      const group = {
        id: Date.now(),
        name: name,
        subject: document.getElementById("newSubject").value,
        topic: topic,
        time: document.getElementById("newTime").value.trim() || "Time to be decided",
        members: 1,
        max: Number(document.getElementById("newSize").value),
        goal: description || "Study together",
        desc: description || "A new StudyBridge study group.",
        owner: currentUser.username,
        memberUsernames: [currentUser.username],
        joinRequests: []
      };

      groups.unshift(group);
      chats[group.id] = [];

      saveGroups();
      saveChats();

      closeModal("createModal");

      document.getElementById("newName").value = "";
      document.getElementById("newTopic").value = "";
      document.getElementById("newTime").value = "";
      document.getElementById("newDesc").value = "";

      renderAll();

      toast("Study group created and published!");

      showPage("mygroups");
    }

    function renderGroupAction(group) {
      if (isMember(group)) {
        if (isOwner(group)) {
  return `
    <div style="display:grid;gap:8px;margin-top:16px">
      <button class="btn btn-primary btn-block" onclick="openStudySession(${group.id})">
        Open Study Session
      </button>

      <button class="btn btn-secondary btn-block" onclick="viewJoinRequests(${group.id})">
        View Join Requests (${group.joinRequests.length})
      </button>

      <button class="btn btn-danger btn-block" onclick="deleteGroup(${group.id})">
        Delete Group
      </button>
    </div>
  `;
}

        return `
          <button class="btn btn-primary btn-block" style="margin-top:16px" onclick="openStudySession(${group.id})">
            Open Study Session
          </button>
        `;
      }

      if (hasRequested(group)) {
        return `
          <button class="btn btn-secondary btn-block" style="margin-top:16px" disabled>
            Request Pending Approval
          </button>
        `;
      }

      if (group.members >= group.max) {
        return `
          <button class="btn btn-secondary btn-block" style="margin-top:16px" disabled>
            Group Is Full
          </button>
        `;
      }

      return `
        <button class="btn btn-primary btn-block" style="margin-top:16px" onclick="requestToJoin(${group.id})">
          Request to Join
        </button>
      `;
    }

    function openGroup(id) {
      const group = groups.find(item => item.id === id);

      if (!group) {
        return;
      }

      document.getElementById("modalGroupTitle").textContent = group.name;

      document.getElementById("modalGroupBody").innerHTML = `
        <p style="margin-bottom:12px">${escapeHtml(group.desc)}</p>

        <div style="margin-bottom:12px">
          <span class="tag">${escapeHtml(group.subject)}</span>
          <span class="tag">${escapeHtml(group.topic)}</span>
        </div>

        <div class="upcoming-item">
          <span>👤 Group Owner</span>
          <b>@${escapeHtml(group.owner)}</b>
        </div>

        <div class="upcoming-item">
          <span>👥 Members</span>
          <b>${group.members}/${group.max}</b>
        </div>

        <div class="upcoming-item">
          <span>📅 Meeting</span>
          <b>${escapeHtml(group.time)}</b>
        </div>

        <div class="upcoming-item">
          <span>🎯 Goal</span>
          <b>${escapeHtml(group.goal)}</b>
        </div>

        ${renderGroupAction(group)}
      `;

      openModal("groupModal");
    }

    function requestToJoin(groupId) {
      const group = groups.find(item => item.id === groupId);

      if (!group) {
        return;
      }

      if (isOwner(group)) {
        toast("You are the owner of this group.");
        return;
      }

      if (isMember(group)) {
        toast("You are already a member of this group.");
        return;
      }

      if (hasRequested(group)) {
        toast("Your request is already waiting for approval.");
        return;
      }

      if (group.members >= group.max) {
        toast("This group is full.");
        return;
      }

      group.joinRequests.push(currentUser.username);

      saveGroups();

      closeModal("groupModal");
      renderAll();

      toast("Join request sent to @" + group.owner + ".");
    }

    function openStudySession(groupId) {
      closeModal("groupModal");

      currentChatGroup = groupId;

      renderMessages();
      showPage("messages");
    }

    function viewJoinRequests(groupId) {
      const group = groups.find(item => item.id === groupId);

      if (!group || !isOwner(group)) {
        return;
      }

      document.getElementById("modalGroupTitle").textContent = "Join Requests";

      document.getElementById("modalGroupBody").innerHTML =
        group.joinRequests.length
          ? `
            <p class="page-sub" style="margin-bottom:16px">
              Approve or decline students who want to join ${escapeHtml(group.name)}.
            </p>

            ${group.joinRequests.map(username => `
              <div class="upcoming-item">
                <span>👤 ${escapeHtml(username)}</span>

                <div class="request-actions">
                  <button class="btn btn-primary btn-sm" onclick="approveJoinRequest(${group.id}, '${encodeURIComponent(username)}')">
                    Approve
                  </button>

                  <button class="btn btn-secondary btn-sm" onclick="declineJoinRequest(${group.id}, '${encodeURIComponent(username)}')">
                    Decline
                  </button>
                </div>
              </div>
            `).join("")}
          `
          : `
            <div class="empty-state">
              <h3>No join requests</h3>
              <p>Students who request to join this group will appear here.</p>
            </div>
          `;

      openModal("groupModal");
    }

    function approveJoinRequest(groupId, encodedUsername) {
      const username = decodeURIComponent(encodedUsername);
      const group = groups.find(item => item.id === groupId);

      if (!group || !isOwner(group)) {
        return;
      }

      if (group.members >= group.max) {
        toast("This group is already full.");
        return;
      }

      group.joinRequests = group.joinRequests.filter(item => item !== username);

      if (!group.memberUsernames.includes(username)) {
        group.memberUsernames.push(username);
        group.members += 1;
      }

      if (!chats[group.id]) {
        chats[group.id] = [];
      }

      saveGroups();
      saveChats();

      renderAll();
      viewJoinRequests(groupId);

      toast(username + " was approved!");
    }

    function declineJoinRequest(groupId, encodedUsername) {
      const username = decodeURIComponent(encodedUsername);
      const group = groups.find(item => item.id === groupId);

      if (!group || !isOwner(group)) {
        return;
      }

      group.joinRequests = group.joinRequests.filter(item => item !== username);

      saveGroups();

      renderAll();
      viewJoinRequests(groupId);

      toast("Request declined.");
    }

    function renderMessages() {
      const joined = groups.filter(group => isMember(group));
      const empty = document.getElementById("messagesEmpty");
      const content = document.getElementById("messagesContent");

      if (!joined.length) {
        empty.style.display = "block";
        content.style.display = "none";
        return;
      }

      empty.style.display = "none";
      content.style.display = "block";

      if (!currentChatGroup || !joined.some(group => group.id === currentChatGroup)) {
        currentChatGroup = joined[0].id;
      }

      document.getElementById("groupTabs").innerHTML = joined.map(group => `
        <button
          class="btn ${currentChatGroup === group.id ? "btn-primary" : "btn-secondary"} btn-sm"
          onclick="selectChat(${group.id})"
        >
          ${escapeHtml(group.name)}
        </button>
      `).join("");

      const group = groups.find(item => item.id === currentChatGroup);

      if (!group) {
        return;
      }

      document.getElementById("chatGroupName").textContent = group.name;

      const messages = chats[currentChatGroup] || [];

      document.getElementById("chatMessages").innerHTML = messages.length
        ? messages.map(message => `
          <div class="msg-bubble ${message.me === currentUser.username ? "me" : "other"}">
            <div class="msg-sender">
              ${message.me === currentUser.username ? "You" : escapeHtml(message.user)}
            </div>
            ${escapeHtml(message.text)}
          </div>
        `).join("")
        : `<div class="msg-empty">No messages yet. Say hello!</div>`;

      const sessions = joined.filter(group => {
        return group.time && group.time !== "Time to be decided";
      });

      document.getElementById("upcomingList").innerHTML = sessions.length
        ? sessions.map(group => `
          <div class="upcoming-item">
            <span>📅 ${escapeHtml(group.name)}</span>
            <b>${escapeHtml(group.time)}</b>
          </div>
        `).join("")
        : `<p class="page-sub">No upcoming sessions.</p>`;
    }

    function selectChat(id) {
      currentChatGroup = id;
      renderMessages();
    }

    function sendMessage() {
      const input = document.getElementById("chatInput");
      const text = input.value.trim();

      if (!text || !currentChatGroup) {
        return;
      }

      if (!chats[currentChatGroup]) {
        chats[currentChatGroup] = [];
      }

      chats[currentChatGroup].push({
        user: currentUser.username,
        me: currentUser.username,
        text: text
      });

      saveChats();

      input.value = "";

      renderMessages();
    }

    document.getElementById("chatInput").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        sendMessage();
      }
    });

    function generateQuiz() {
      const topic =
        document.getElementById("quizTopic").value.trim() || "your topic";

      document.getElementById("quizOutput").innerHTML = `
        <div style="margin-bottom:12px">
          <p style="font-weight:600;font-size:14px;margin-bottom:8px">
            1. Which statement best describes ${escapeHtml(topic)}?
          </p>

          <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0">
            <input type="radio" name="quizQuestion"> A. The core concept
          </label>

          <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0">
            <input type="radio" name="quizQuestion"> B. An unrelated idea
          </label>

          <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0">
            <input type="radio" name="quizQuestion"> C. A common misconception
          </label>
        </div>

        <button class="btn btn-secondary btn-sm" onclick="toast('Quiz submitted!')">
          Submit Quiz
        </button>
      `;
    }

    function summarize() {
      document.getElementById("summaryOutput").innerHTML = `
        <div>
          <b style="font-size:14px">Session Summary</b>
          <p style="font-size:14px">• Reviewed the main concepts and examples.</p>
          <p style="font-size:14px">• Group identified one topic to revisit.</p>
          <p style="font-size:14px">• Suggested next step: complete a short practice quiz.</p>
        </div>
      `;
    }

    function appendTeachBackEntry(role, content) {
      const entry = document.createElement("article");
      entry.className = `teachback-entry ${role === "assistant" ? "student" : "teacher"}`;
      const speaker = document.createElement("span");
      speaker.className = "teachback-speaker";
      speaker.textContent = role === "assistant" ? "AI student" : "You";
      const message = document.createElement("p");
      message.textContent = content;
      entry.append(speaker, message);
      document.getElementById("teachbackTranscript").append(entry);
      entry.scrollIntoView({ block: "nearest" });
    }

    function setTeachBackBusy(busy) {
      teachBackBusy = busy;
      document.getElementById("teachbackSend").disabled = busy;
      document.getElementById("teachbackFinish").disabled = busy;
      document.getElementById("teachbackMessage").disabled = busy;
      document.getElementById("teachbackTopic").disabled = busy;
      document.querySelector("#teachbackTopicForm button[type='submit']").disabled = busy;
    }

    async function requestTeachBack(payload) {
      const response = await fetch("/api/teach-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Teach Back is temporarily unavailable.");
      return result;
    }

    document.getElementById("teachbackTopicForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (teachBackBusy) return;

      const topic = document.getElementById("teachbackTopic").value.trim();
      if (!topic) return;

      teachBackTopic = topic;
      teachBackHistory = [];
      const message = `I want to teach you about ${topic}.`;
      const status = document.getElementById("teachbackSetupStatus");
      status.textContent = "Checking the topic...";
      setTeachBackBusy(true);

      try {
        const result = await requestTeachBack({ action: "message", topic, history: [], message });
        if (result.classification !== "SAFE") {
          status.textContent = result.reply;
          return;
        }

        teachBackHistory.push({ role: "user", content: message });
        teachBackHistory.push({ role: "assistant", content: result.reply });
        document.getElementById("teachbackTopicTitle").textContent = topic;
        document.getElementById("teachbackTranscript").replaceChildren();
        appendTeachBackEntry("user", message);
        appendTeachBackEntry("assistant", result.reply);
        document.getElementById("teachbackSetup").hidden = true;
        document.getElementById("teachbackConversation").hidden = false;
        document.getElementById("teachbackFeedback").hidden = true;
        document.getElementById("teachbackMessageStatus").textContent = "";
        document.getElementById("teachbackMessage").focus();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        setTeachBackBusy(false);
      }
    });

    document.getElementById("teachbackMessageForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (teachBackBusy) return;

      const input = document.getElementById("teachbackMessage");
      const message = input.value.trim();
      if (!message) return;

      const status = document.getElementById("teachbackMessageStatus");
      status.textContent = "Checking your message...";
      setTeachBackBusy(true);

      try {
        const result = await requestTeachBack({
          action: "message",
          topic: teachBackTopic,
          history: teachBackHistory.slice(-40),
          message
        });
        if (result.classification !== "SAFE") {
          status.textContent = result.reply;
          return;
        }

        teachBackHistory.push({ role: "user", content: message });
        teachBackHistory.push({ role: "assistant", content: result.reply });
        appendTeachBackEntry("user", message);
        appendTeachBackEntry("assistant", result.reply);
        input.value = "";
        status.textContent = "";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        setTeachBackBusy(false);
        input.focus();
      }
    });

    function renderFeedbackList(id, items) {
      const list = document.getElementById(id);
      list.replaceChildren();
      const entries = items.length ? items : ["No examples noted this time."];
      entries.forEach(text => {
        const item = document.createElement("li");
        item.textContent = text;
        list.append(item);
      });
    }

    document.getElementById("teachbackFinish").addEventListener("click", async () => {
      if (teachBackBusy) return;
      const status = document.getElementById("teachbackMessageStatus");
      status.textContent = "Reviewing your teaching...";
      setTeachBackBusy(true);

      try {
        const result = await requestTeachBack({
          action: "feedback",
          topic: teachBackTopic,
          history: teachBackHistory.slice(-40)
        });
        const feedback = result.feedback;
        document.getElementById("teachbackScore").textContent = feedback.score;
        renderFeedbackList("teachbackClearTopics", feedback.clearTopics);
        renderFeedbackList("teachbackNeedsWork", feedback.needsMoreExplanation);
        renderFeedbackList("teachbackAnswered", feedback.answeredSuccessfully);
        document.getElementById("teachbackFeedbackStatus").textContent = "";
        document.getElementById("teachbackConversation").hidden = true;
        document.getElementById("teachbackFeedback").hidden = false;
      } catch (error) {
        status.textContent = error.message;
      } finally {
        setTeachBackBusy(false);
      }
    });

    document.getElementById("teachbackRestart").addEventListener("click", () => {
      teachBackTopic = "";
      teachBackHistory = [];
      document.getElementById("teachbackTopicForm").reset();
      document.getElementById("teachbackTranscript").replaceChildren();
      document.getElementById("teachbackSetupStatus").textContent = "";
      document.getElementById("teachbackMessageStatus").textContent = "";
      document.getElementById("teachbackFeedback").hidden = true;
      document.getElementById("teachbackConversation").hidden = true;
      document.getElementById("teachbackSetup").hidden = false;
      document.getElementById("teachbackTopic").focus();
    });

    function openModal(id) {
      document.getElementById(id).classList.add("show");
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove("show");
    }

    document.querySelectorAll(".modal").forEach(modal => {
      modal.addEventListener("click", event => {
        if (event.target === modal) {
          modal.classList.remove("show");
        }
      });
    });

    let toastTimer;

    function toast(message) {
      const element = document.getElementById("toast");

      element.textContent = message;
      element.classList.add("show");

      clearTimeout(toastTimer);

      toastTimer = setTimeout(() => {
        element.classList.remove("show");
      }, 2500);
    }
