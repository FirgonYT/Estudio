// App JS — robusto, espera DOM, muestra debug y controla Firebase con seguridad.

(function () {
	// Estado y helpers mínimos (definidos fuera de DOMContentLoaded)
	let currentUser = null;
	let allProposals = [];
	let proposalsUnsub = null;
	let messagesUnsub = null;
	let lastError = null;

	function logError(err) {
		console.error(err);
		lastError = (err && err.message) ? err.message : String(err);
		updateDebugPanel();
	}

	function firebaseReady() {
		return !!(window.firebase && window.auth && window.db && firebase.apps && firebase.apps.length);
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text || '';
		return div.innerHTML;
	}

	function formatDate(dateString) {
		try {
			const date = new Date(dateString);
			return date.toLocaleString('es-ES', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
		} catch (e) {
			return '';
		}
	}

	function initials(name) {
		if (!name) return '?';
		return name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
	}

	// Debug panel (DOM)
	let debugPanel;
	function createDebugPanel() {
		debugPanel = document.createElement('div');
		debugPanel.id = 'debugPanel';
		debugPanel.style.position = 'fixed';
		debugPanel.style.right = '12px';
		debugPanel.style.bottom = '12px';
		debugPanel.style.zIndex = '99999';
		debugPanel.style.background = 'rgba(0,0,0,0.7)';
		debugPanel.style.color = '#fff';
		debugPanel.style.padding = '10px';
		debugPanel.style.borderRadius = '8px';
		debugPanel.style.fontSize = '12px';
		debugPanel.style.maxWidth = '320px';
		debugPanel.style.boxShadow = '0 8px 30px rgba(0,0,0,0.4)';
		debugPanel.innerHTML = '<strong>Debug Firebase</strong><div id="debugContent" style="margin-top:6px;"></div>';
		document.body.appendChild(debugPanel);
		updateDebugPanel();
	}
	function updateDebugPanel() {
		if (!debugPanel) return;
		const content = debugPanel.querySelector('#debugContent');
		const apps = (window.firebase && firebase.apps) ? firebase.apps.length : 0;
		const authOk = !!window.auth;
		const dbOk = !!window.db;
		const txt = `
			apps: ${apps}<br/>
			auth: ${authOk ? 'OK' : 'NO'}<br/>
			firestore: ${dbOk ? 'OK' : 'NO'}<br/>
			user: ${currentUser ? (currentUser.email || currentUser.uid) : 'anon'}<br/>
			lastError: ${lastError ? escapeHtml(lastError) : 'none'}
		`;
		content.innerHTML = txt;
	}

	// MAIN (esperar DOM)
	document.addEventListener('DOMContentLoaded', () => {
		// Crear panel debug
		createDebugPanel();

		// Seleccionar elementos (ahora que DOM existe)
		const openAuthBtn = document.getElementById('openAuth');
		const authModal = document.getElementById('authModal');
		const closeAuthBtn = document.getElementById('closeAuthBtn');
		const showSigninTab = document.getElementById('showSigninTab');
		const showSignupTab = document.getElementById('showSignupTab');
		const signinTab = document.getElementById('signinTab');
		const signupTab = document.getElementById('signupTab');

		const signinForm = document.getElementById('signinForm');
		const signupForm = document.getElementById('signupForm');

		const openProfileBtn = document.getElementById('openProfileBtn');

		const proposalForm = document.getElementById('proposalForm');
		const proposalsList = document.getElementById('proposalsList');
		const searchInput = document.getElementById('searchInput');
		const filterRole = document.getElementById('filterRole');
		const filterCategory = document.getElementById('filterCategory');
		const totalProposalsSpan = document.getElementById('totalProposals');

		const messageForm = document.getElementById('messageForm');
		const messageText = document.getElementById('messageText');
		const messagesList = document.getElementById('messagesList');

		const roleChart = document.getElementById('roleChart');
		const institutionChart = document.getElementById('institutionChart');
		const categoryChart = document.getElementById('categoryChart');

		// Messenger chat selectors
		const searchUserForm = document.getElementById('searchUserForm');
		const searchUserEmail = document.getElementById('searchUserEmail');
		const messengerChat = document.getElementById('messengerChat');
		const messengerChatTitle = document.getElementById('messengerChatTitle');
		const closeMessengerChat = document.getElementById('closeMessengerChat');
		const messengerMessagesList = document.getElementById('messengerMessagesList');
		const messengerMessageForm = document.getElementById('messengerMessageForm');
		const messengerMessageText = document.getElementById('messengerMessageText');

		let messengerOtherUser = null;
		let messengerChatUnsub = null;

		// Guard: firebase debe estar inicializado
		if (!firebaseReady()) {
			lastError = 'Firebase no inicializado. Revisa index.html y la consola.';
			updateDebugPanel();
			console.warn('Firebase no inicializado en DOMContentLoaded. Algunas funciones estarán deshabilitadas.');
		} else {
			updateDebugPanel();
		}

		// UI helpers
		function setUIEnabledForAuth(enabled) {
			// Habilita/deshabilita formularios
			if (proposalForm) {
				Array.from(proposalForm.elements).forEach(el => el.disabled = !enabled);
				const submit = proposalForm.querySelector('button[type="submit"]');
				if (submit) submit.disabled = !enabled;
			}
			if (messageForm) {
				Array.from(messageForm.elements).forEach(el => el.disabled = !enabled);
				const msub = messageForm.querySelector('button[type="submit"]');
				if (msub) msub.disabled = !enabled;
			}
		}

		// Modales / tabs
		openAuthBtn && openAuthBtn.addEventListener('click', () => { if (authModal) authModal.style.display = 'flex'; });
		closeAuthBtn && closeAuthBtn.addEventListener('click', () => { if (authModal) authModal.style.display = 'none'; });
		window.addEventListener('click', (e) => { if (e.target === authModal) authModal.style.display = 'none'; });
		showSigninTab && showSigninTab.addEventListener('click', () => { if (signinTab && signupTab) { signinTab.style.display='block'; signupTab.style.display='none'; }});
		showSignupTab && showSignupTab.addEventListener('click', () => { if (signinTab && signupTab) { signupTab.style.display='block'; signinTab.style.display='none'; }});

		openProfileBtn && openProfileBtn.addEventListener('click', () => window.location.href = 'profile.html');

		// Signup
		if (signupForm) signupForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!firebaseReady()) return alert('Firebase no configurado.');
			try {
				const name = document.getElementById('signupName').value.trim();
				const email = document.getElementById('signupEmail').value.trim();
				const password = document.getElementById('signupPassword').value;
				const role = document.getElementById('signupRole').value;
				const institution = document.getElementById('signupInstitution').value.trim();
				if (!name || !email || !password || !role || !institution) return alert('Completa todos los campos.');
				const userCred = await window.auth.createUserWithEmailAndPassword(email, password);
				const user = userCred.user;
				await user.updateProfile({ displayName: name });
				await window.db.collection('users').doc(user.uid).set({
					name, role, institution, email, createdAt: firebase.firestore.FieldValue.serverTimestamp()
				});
				signupForm.reset();
				if (authModal) authModal.style.display = 'none';
			} catch (err) { logError(err); alert('Error en registro: ' + (err.message||err)); }
		});

		// Signin
		if (signinForm) signinForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!firebaseReady()) return alert('Firebase no configurado.');
			try {
				const email = document.getElementById('signinEmail').value.trim();
				const password = document.getElementById('signinPassword').value;
				await window.auth.signInWithEmailAndPassword(email, password);
				signinForm.reset();
				if (authModal) authModal.style.display = 'none';
			} catch (err) { logError(err); alert('Error al iniciar sesión: ' + (err.message||err)); }
		});

		navSignOutBtn && navSignOutBtn.addEventListener('click', async () => {
			if (!firebaseReady()) return alert('Firebase no configurado.');
			try { await window.auth.signOut(); alert('Sesión cerrada'); } catch (err) { logError(err); alert('Error cerrando sesión'); }
		});

		// Profile save
		if (profileForm) profileForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!firebaseReady()) return alert('Firebase no configurado.');
			if (!currentUser) return alert('No autenticado.');
			try {
				const name = document.getElementById('profileName').value.trim();
				const role = document.getElementById('profileRole').value;
				const institution = document.getElementById('profileInstitution').value.trim();
				await window.db.collection('users').doc(currentUser.uid).set({
					name, role, institution, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
				}, { merge: true });
				await currentUser.updateProfile({ displayName: name });
				navUserName && (navUserName.textContent = name);
				navAvatar && (navAvatar.textContent = initials(name));
				if (profileModal) profileModal.style.display = 'none';
				alert('Perfil actualizado');
			} catch (err) { logError(err); alert('Error actualizando perfil'); }
		});

		// Realtime listeners
		function startRealtimeListeners() {
			if (!firebaseReady()) return;
			// proposals
			if (proposalsUnsub) proposalsUnsub();
			proposalsUnsub = window.db.collection('proposals').orderBy('date','desc')
				.onSnapshot(snapshot => {
					allProposals = [];
					snapshot.forEach(doc => {
						const data = doc.data();
						const date = data.date && data.date.toDate ? data.date.toDate().toISOString() : new Date().toISOString();
						allProposals.push({ id: doc.id, ...data, date });
					});
					renderProposals(allProposals);
					updateStats();
				}, err => logError(err));
			// messages
			if (messagesUnsub) messagesUnsub();
			messagesUnsub = window.db.collection('messages').orderBy('date','asc').limitToLast(200)
				.onSnapshot(snapshot => {
					const msgs = [];
					snapshot.forEach(doc => {
						const data = doc.data();
						const date = data.date && data.date.toDate ? data.date.toDate().toISOString() : new Date().toISOString();
						msgs.push({ id: doc.id, ...data, date });
					});
					renderMessages(msgs);
				}, err => logError(err));
		}

		// Publish proposal
		if (proposalForm) proposalForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!firebaseReady()) return alert('Firebase no configurado.');
			if (!currentUser) return alert('Debes iniciar sesión para publicar.');
			try {
				const title = document.getElementById('title').value.trim();
				const category = document.getElementById('category').value;
				const description = document.getElementById('description').value.trim();
				if (!title || !category || !description) return alert('Completa todos los campos.');
				const userDoc = await window.db.collection('users').doc(currentUser.uid).get();
				const profile = userDoc.exists ? userDoc.data() : { name: currentUser.displayName || currentUser.email, role:'', institution:'' };
				const proposal = {
					uid: currentUser.uid,
					name: profile.name || currentUser.displayName || currentUser.email,
					role: profile.role || '',
					institution: profile.institution || '',
					category, title, description,
					date: firebase.firestore.FieldValue.serverTimestamp(),
					votes: 0
				};
				await window.db.collection('proposals').add(proposal);
				proposalForm.reset();
			} catch (err) { logError(err); alert('Error publicando propuesta'); }
		});

		// Send message
		if (messageForm) messageForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!firebaseReady()) return alert('Firebase no configurado.');
			if (!currentUser) return alert('Inicia sesión para enviar mensajes.');
			try {
				const text = messageText.value.trim();
				if (!text) return;
				const userDoc = await window.db.collection('users').doc(currentUser.uid).get();
				const profile = userDoc.exists ? userDoc.data() : { name: currentUser.displayName || currentUser.email };
				await window.db.collection('messages').add({
					uid: currentUser.uid,
					name: profile.name || currentUser.displayName || currentUser.email,
					text,
					date: firebase.firestore.FieldValue.serverTimestamp()
				});
				messageForm.reset();
			} catch (err) { logError(err); alert('Error enviando mensaje'); }
		});

		// Buscar usuario y abrir chat privado tipo Messenger
		searchUserForm && searchUserForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const email = searchUserEmail.value.trim().toLowerCase();
			if (!email || !window.db) return;
			if (!currentUser) return alert('Debes iniciar sesión para chatear con otros usuarios.');
			try {
				const q = await window.db.collection('users').where('email', '==', email).get();
				if (q.empty) {
					alert('No se encontró el usuario.');
					return;
				}
				const doc = q.docs[0];
				const data = doc.data();
				messengerOtherUser = { uid: doc.id, name: data.name, email: data.email };
				openMessengerChat(currentUser, messengerOtherUser);
			} catch (err) {
				console.error('Error buscando usuario:', err);
				alert('Error buscando usuario.');
			}
		});

		function openMessengerChat(me, them) {
			if (!me || !them) return;
			messengerChat.style.display = 'block';
			messengerChatTitle.textContent = `Chat con ${them.name || them.email}`;
			messengerMessagesList.innerHTML = '<p class="empty-state">Cargando mensajes...</p>';
			if (messengerChatUnsub) messengerChatUnsub();
			const chatId = [me.uid, them.uid].sort().join('_');
			messengerChatUnsub = window.db.collection('privateChats').doc(chatId).collection('messages')
				.orderBy('date', 'asc').limitToLast(100)
				.onSnapshot(snapshot => {
					const msgs = [];
					snapshot.forEach(doc => {
						const d = doc.data();
						let date = '';
						if (d.date && typeof d.date.toDate === 'function') {
							date = d.date.toDate().toLocaleString('es-ES', { hour:'2-digit', minute:'2-digit', day:'numeric', month:'short' });
						}
						msgs.push({
							text: d.text,
							name: d.name,
							from: d.from,
							date
						});
					});
					if (!msgs.length) {
						messengerMessagesList.innerHTML = '<p class="empty-state">No hay mensajes privados aún.</p>';
						return;
					}
					messengerMessagesList.innerHTML = msgs.map(m => `
						<div class="messenger-msg-row ${m.from === me.uid ? 'me' : 'them'}">
							<div class="messenger-msg-bubble">
								${escapeHtml(m.text)}
								<div class="messenger-msg-meta">${m.from === me.uid ? 'Tú' : m.name} • ${m.date}</div>
							</div>
						</div>
					`).join('');
					messengerMessagesList.scrollTop = messengerMessagesList.scrollHeight;
				});
			messengerMessageForm.onsubmit = async (e) => {
				e.preventDefault();
				const text = messengerMessageText.value.trim();
				if (!text) return;
				const userDoc = await window.db.collection('users').doc(me.uid).get();
				const profile = userDoc.exists ? userDoc.data() : { name: me.displayName || me.email };
				await window.db.collection('privateChats').doc(chatId).collection('messages').add({
					text,
					from: me.uid,
					name: profile.name || me.displayName || me.email,
					date: firebase.firestore.FieldValue.serverTimestamp()
				});
				messengerMessageForm.reset();
			};
		}

		closeMessengerChat && closeMessengerChat.addEventListener('click', () => {
			messengerChat.style.display = 'none';
			if (messengerChatUnsub) messengerChatUnsub();
			messengerMessagesList.innerHTML = '';
			messengerOtherUser = null;
		});

		// Renderers
		function renderProposals(proposals) {
			const listEl = proposalsList;
			if (!listEl) return;
			if (!proposals || proposals.length === 0) {
				listEl.innerHTML = '<p class="empty-state">No hay propuestas aún. ¡Sé el primero en compartir una!</p>';
				totalProposalsSpan && (totalProposalsSpan.textContent = `Total: 0`);
				return;
			}
			listEl.innerHTML = proposals.map(p => `
				<div class="proposal-card" data-id="${p.id}">
					<div class="proposal-title">${escapeHtml(p.title)}</div>
					<div class="proposal-meta">
						<span class="badge">${escapeHtml(p.role || '')}</span>
						<span class="badge institution">${escapeHtml(p.institution || '')}</span>
						<span class="badge">${escapeHtml(p.category || '')}</span>
					</div>
					<div class="proposal-description">${escapeHtml(p.description)}</div>
					<div class="proposal-date">Por ${escapeHtml(p.name)} • ${formatDate(p.date)}</div>
					<div class="proposal-actions">
						<button class="btn-comment" data-id="${p.id}">Comentarios</button>
						${currentUser && currentUser.uid === p.uid ? `<button class="btn-delete" data-id="${p.id}">Eliminar</button>` : ''}
					</div>
					<div class="comments-section" id="comments-${p.id}" style="display:none; margin-top:8px;">
						<div id="comments-list-${p.id}" class="comments-list"><p class="empty-state">No hay comentarios</p></div>
						<form class="comment-form" data-id="${p.id}" style="margin-top:8px; display:flex; gap:8px;">
							<input class="comment-input" placeholder="Escribe un comentario..." required />
							<button type="submit" class="btn-submit">Comentar</button>
						</form>
					</div>
				</div>
			`).join('');
			totalProposalsSpan && (totalProposalsSpan.textContent = `Total: ${allProposals.length}`);

			// attach listeners after render
			document.querySelectorAll('.btn-comment').forEach(btn => {
				btn.addEventListener('click', (e) => {
					const id = e.currentTarget.dataset.id;
					const section = document.getElementById('comments-' + id);
					if (!section) return;
					section.style.display = section.style.display === 'none' ? 'block' : 'none';
					if (section.style.display === 'block') loadComments(id);
				});
			});
			document.querySelectorAll('.comment-form').forEach(form => {
				form.addEventListener('submit', async (e) => {
					e.preventDefault();
					const pid = form.dataset.id;
					const input = form.querySelector('.comment-input');
					if (!input) return;
					if (!firebaseReady()) return alert('Firebase no configurado.');
					if (!currentUser) return alert('Inicia sesión para comentar.');
					const text = input.value.trim();
					if (!text) return;
					try {
						const userDoc = await window.db.collection('users').doc(currentUser.uid).get();
						const profile = userDoc.exists ? userDoc.data() : { name: currentUser.displayName || currentUser.email };
						await window.db.collection('comments').add({
							proposalId: pid,
							uid: currentUser.uid,
							name: profile.name || currentUser.displayName || currentUser.email,
							text,
							date: firebase.firestore.FieldValue.serverTimestamp()
						});
						input.value = '';
						loadComments(pid);
					} catch (err) { logError(err); alert('Error publicando comentario'); }
				});
			});
			document.querySelectorAll('.btn-delete').forEach(btn => {
				btn.addEventListener('click', async (e) => {
					const id = e.currentTarget.dataset.id;
					if (!confirm('Eliminar propuesta?')) return;
					try { await window.db.collection('proposals').doc(id).delete(); } catch (err) { logError(err); alert('Error eliminando propuesta'); }
				});
			});
		}

		function loadComments(proposalId) {
			const listEl = document.getElementById('comments-list-' + proposalId);
			if (!listEl) return;
			window.db.collection('comments').where('proposalId','==',proposalId).orderBy('date','asc').limitToLast(200).get()
				.then(snapshot => {
					const items = [];
					snapshot.forEach(doc => {
						const d = doc.data();
						const date = d.date && d.date.toDate ? d.date.toDate().toISOString() : new Date().toISOString();
						items.push({ id: doc.id, ...d, date });
					});
					if (!items.length) { listEl.innerHTML = '<p class="empty-state">No hay comentarios</p>'; return; }
					listEl.innerHTML = items.map(c => `<div style="padding:6px;border-bottom:1px solid #eee;"><strong>${escapeHtml(c.name)}</strong> <span style="color:#999;font-size:12px;">• ${formatDate(c.date)}</span><div style="margin-top:4px;">${escapeHtml(c.text)}</div></div>`).join('');
				})
				.catch(err => logError(err));
		}

		function renderMessages(msgs) {
			if (!messagesList) return;
			if (!msgs || msgs.length === 0) { messagesList.innerHTML = '<p class="empty-state">No hay mensajes aún.</p>'; return; }
			messagesList.innerHTML = msgs.map(m => `<div style="padding:6px;border-bottom:1px solid #eee;"><strong>${escapeHtml(m.name)}</strong> <span style="color:#999;font-size:12px;">• ${formatDate(m.date)}</span><div style="margin-top:4px;">${escapeHtml(m.text)}</div></div>`).join('');
			messagesList.scrollTop = messagesList.scrollHeight;
		}

		function updateStats() {
			const roleStats = {}, instStats = {}, catStats = {};
			allProposals.forEach(p => {
				roleStats[p.role] = (roleStats[p.role]||0)+1;
				instStats[p.institution] = (instStats[p.institution]||0)+1;
				catStats[p.category] = (catStats[p.category]||0)+1;
			});
			if (roleChart) roleChart.innerHTML = Object.entries(roleStats).map(([r,c])=>`<div class="stat-item"><span class="stat-label">${escapeHtml(r)}</span><span class="stat-count">${c}</span></div>`).join('');
			if (institutionChart) institutionChart.innerHTML = Object.entries(instStats).slice(0,5).map(([i,c])=>`<div class="stat-item"><span class="stat-label">${escapeHtml(i)}</span><span class="stat-count">${c}</span></div>`).join('');
			if (categoryChart) categoryChart.innerHTML = Object.entries(catStats).map(([k,c])=>`<div class="stat-item"><span class="stat-label">${escapeHtml(k)}</span><span class="stat-count">${c}</span></div>`).join('');
		}

		// Auth state listener
		if (firebaseReady()) {
			window.auth.onAuthStateChanged(async (user) => {
				currentUser = user;
				if (user) {
					try {
						const userDoc = await window.db.collection('users').doc(user.uid).get();
						const profile = userDoc.exists ? userDoc.data() : { name: user.displayName || user.email, role:'', institution:'' };
						navUser && (navUser.style.display = 'flex');
						navUserName && (navUserName.textContent = profile.name || user.email);
						navAvatar && (navAvatar.textContent = initials(profile.name || user.email));
						openAuthBtn && (openAuthBtn.style.display = 'none');
						setUIEnabledForAuth(true);
						startRealtimeListeners();
						updateDebugPanel();
					} catch (err) { logError(err); }
				} else {
					navUser && (navUser.style.display = 'none');
					openAuthBtn && (openAuthBtn.style.display = 'inline-block');
					setUIEnabledForAuth(false);
					// keep realtime listeners active for guests (call start if not started)
					startRealtimeListeners();
					updateDebugPanel();
				}
			});
		} else {
			// If firebase not ready, disable auth-only UI
			setUIEnabledForAuth(false);
		}

		// Iniciar listeners si firebase está listo (para invitados también)
		if (firebaseReady()) startRealtimeListeners();
		updateDebugPanel();
	}); // end DOMContentLoaded

	// Definiciones defensivas para evitar ReferenceError cuando la UI de perfil está en otra página.
	var profileModal = null;
	var closeProfileBtn = null;
	var profileForm = null;
	var profileCancelBtn = null;
	var profileName = null;
	var profileRole = null;
	var profileInstitution = null;
})();
