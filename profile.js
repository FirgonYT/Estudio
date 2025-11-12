document.addEventListener('DOMContentLoaded', () => {
	if (!window.auth || !window.db) {
		alert('Firebase no está inicializado. Vuelve a la página principal y revisa la configuración.');
		return;
	}

	const form = document.getElementById('profileFormPage');
	const nameInp = document.getElementById('profileNamePage');
	const roleSel = document.getElementById('profileRolePage');
	const instInp = document.getElementById('profileInstitutionPage');
	const msg = document.getElementById('profileMessage');
	const btnSignOut = document.getElementById('btnSignOutProfile');
	const myProposalsDiv = document.getElementById('myProposals');

	// Nuevos elementos para perfil público y chat privado
	const searchUserForm = document.getElementById('searchUserForm');
	const searchUserEmail = document.getElementById('searchUserEmail');
	const otherProfileDiv = document.getElementById('otherProfile');
	const privateChatSection = document.getElementById('privateChatSection');
	const chatWithName = document.getElementById('chatWithName');
	const privateMessagesList = document.getElementById('privateMessagesList');
	const privateMessageForm = document.getElementById('privateMessageForm');
	const privateMessageText = document.getElementById('privateMessageText');

	let currentUser = null;
	let otherUser = null;
	let privateChatUnsub = null;

	// Redirige a index si no está autenticado
	window.auth.onAuthStateChanged(async (user) => {
		currentUser = user;
		if (!user) {
			window.location.href = 'index.html';
			return;
		}
		try {
			const doc = await window.db.collection('users').doc(user.uid).get();
			const data = doc.exists ? doc.data() : { name: user.displayName || '', role:'', institution: '' };
			nameInp.value = data.name || user.displayName || '';
			roleSel.value = data.role || '';
			instInp.value = data.institution || '';
			// Cargar publicaciones del usuario solo si está autenticado y Firestore disponible
			if (window.db && user.uid) {
				loadMyProposals(user.uid);
			} else {
				myProposalsDiv.innerHTML = '<p class="empty-state">No se pudo acceder a Firestore.</p>';
			}
		} catch (err) {
			console.error('Error cargando perfil:', err);
			msg.textContent = 'Error cargando perfil. Revisa la consola.';
			myProposalsDiv.innerHTML = '<p class="empty-state">Error cargando publicaciones.</p>';
		}
	});

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (!currentUser) { msg.textContent = 'No autenticado'; return; }
		const name = nameInp.value.trim();
		const role = roleSel.value;
		const institution = instInp.value.trim();
		if (!name || !role || !institution) { msg.textContent = 'Completa todos los campos'; return; }
		try {
			await window.db.collection('users').doc(currentUser.uid).set({
				name, role, institution, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
			}, { merge: true });
			await currentUser.updateProfile({ displayName: name });
			msg.textContent = 'Perfil guardado';
			setTimeout(()=> msg.textContent = '', 2500);
		} catch (err) {
			console.error('Error guardando perfil:', err);
			msg.textContent = 'Error guardando perfil';
		}
	});

	btnSignOut.addEventListener('click', async () => {
		try {
			await window.auth.signOut();
			window.location.href = 'index.html';
		} catch (err) {
			console.error('Error signout:', err);
			msg.textContent = 'Error cerrando sesión';
		}
	});

	// Mostrar publicaciones del usuario
	function loadMyProposals(uid) {
		if (!myProposalsDiv) return;
		myProposalsDiv.innerHTML = '<p class="empty-state">Cargando publicaciones...</p>';
		// Verifica que Firestore esté disponible
		if (!window.db) {
			myProposalsDiv.innerHTML = '<p class="empty-state">Firestore no disponible.</p>';
			return;
		}
		window.db.collection('proposals').where('uid', '==', uid).orderBy('date', 'desc').get()
			.then(snapshot => {
				const items = [];
				snapshot.forEach(doc => {
					const d = doc.data();
					let date = '';
					if (d.date && typeof d.date.toDate === 'function') {
						date = d.date.toDate().toLocaleString('es-ES', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
					}
					items.push({
						title: d.title,
						description: d.description,
						category: d.category,
						date,
						id: doc.id
					});
				});
				if (!items.length) {
					myProposalsDiv.innerHTML = '<p class="empty-state">No has publicado ninguna propuesta aún.</p>';
					return;
				}
				myProposalsDiv.innerHTML = items.map(p => `
					<div class="proposal-card" style="margin-bottom:12px;">
						<div class="proposal-title">${p.title}</div>
						<div class="proposal-meta">
							<span class="badge">${p.category}</span>
						</div>
						<div class="proposal-description">${p.description}</div>
						<div class="proposal-date">${p.date}</div>
					</div>
				`).join('');
			})
			.catch(err => {
				console.error('Error cargando publicaciones:', err);
				myProposalsDiv.innerHTML = `<p class="empty-state">Error cargando publicaciones.<br>${err.message || err}</p>`;
			});
	}

	// Buscar y mostrar perfil de otro usuario
	searchUserForm && searchUserForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const email = searchUserEmail.value.trim().toLowerCase();
		if (!email || !window.db) return;
		otherProfileDiv.innerHTML = '<p class="empty-state">Buscando usuario...</p>';
		privateChatSection.style.display = 'none';
		otherUser = null;
		try {
			const q = await window.db.collection('users').where('email', '==', email).get();
			if (q.empty) {
				otherProfileDiv.innerHTML = '<p class="empty-state">No se encontró el usuario.</p>';
				return;
			}
			const doc = q.docs[0];
			const data = doc.data();
			otherUser = { uid: doc.id, ...data };
			otherProfileDiv.innerHTML = `
				<div style="margin-bottom:10px;">
					<strong>${data.name}</strong> <span class="badge">${data.role}</span>
					<br><span style="color:#666;">${data.institution}</span>
				</div>
				<div id="otherUserProposals"></div>
				${currentUser && currentUser.uid !== doc.id ? `<button id="startPrivateChatBtn" class="btn-submit">Iniciar chat privado</button>` : ''}
			`;
			loadOtherUserProposals(doc.id);
			// Chat privado: solo si no es el propio usuario
			if (currentUser && currentUser.uid !== doc.id) {
				document.getElementById('startPrivateChatBtn').onclick = () => {
					startPrivateChat(currentUser.uid, doc.id, data.name);
				};
			}
		} catch (err) {
			console.error('Error buscando usuario:', err);
			otherProfileDiv.innerHTML = '<p class="empty-state">Error buscando usuario.</p>';
		}
	});

	// Mostrar publicaciones del usuario buscado
	function loadOtherUserProposals(uid) {
		const div = document.getElementById('otherUserProposals');
		if (!div) return;
		div.innerHTML = '<p class="empty-state">Cargando publicaciones...</p>';
		window.db.collection('proposals').where('uid', '==', uid).orderBy('date', 'desc').get()
			.then(snapshot => {
				const items = [];
				snapshot.forEach(doc => {
					const d = doc.data();
					let date = '';
					if (d.date && typeof d.date.toDate === 'function') {
						date = d.date.toDate().toLocaleString('es-ES', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
					}
					items.push({
						title: d.title,
						description: d.description,
						category: d.category,
						date,
						id: doc.id
					});
				});
				if (!items.length) {
					div.innerHTML = '<p class="empty-state">No ha publicado ninguna propuesta aún.</p>';
					return;
				}
				div.innerHTML = items.map(p => `
					<div class="proposal-card" style="margin-bottom:12px;">
						<div class="proposal-title">${p.title}</div>
						<div class="proposal-meta">
							<span class="badge">${p.category}</span>
						</div>
						<div class="proposal-description">${p.description}</div>
						<div class="proposal-date">${p.date}</div>
					</div>
				`).join('');
			})
			.catch(err => {
				console.error('Error cargando publicaciones:', err);
				div.innerHTML = `<p class="empty-state">Error cargando publicaciones.<br>${err.message || err}</p>`;
			});
	}

	// Chat privado entre dos usuarios (por uid)
	function startPrivateChat(uid1, uid2, otherName) {
		privateChatSection.style.display = 'block';
		chatWithName.textContent = otherName;
		privateMessagesList.innerHTML = '<p class="empty-state">Cargando mensajes...</p>';
		if (privateChatUnsub) privateChatUnsub();
		// El id de chat es la concatenación ordenada de los dos uids
		const chatId = [uid1, uid2].sort().join('_');
		privateChatUnsub = window.db.collection('privateChats').doc(chatId).collection('messages')
			.orderBy('date', 'asc').limitToLast(100)
			.onSnapshot(snapshot => {
				const msgs = [];
				snapshot.forEach(doc => {
					const d = doc.data();
					let date = '';
					if (d.date && typeof d.date.toDate === 'function') {
						date = d.date.toDate().toLocaleString('es-ES', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
					}
					msgs.push({
						text: d.text,
						name: d.name,
						from: d.from,
						date
					});
				});
				if (!msgs.length) {
					privateMessagesList.innerHTML = '<p class="empty-state">No hay mensajes privados aún.</p>';
					return;
				}
				privateMessagesList.innerHTML = msgs.map(m => `
					<div style="padding:6px;border-bottom:1px solid #eee;">
						<strong>${m.name}${m.from === currentUser.uid ? ' (Tú)' : ''}</strong>
						<span style="color:#999;font-size:12px;">• ${m.date}</span>
						<div style="margin-top:4px;">${m.text}</div>
					</div>
				`).join('');
				privateMessagesList.scrollTop = privateMessagesList.scrollHeight;
			});
		// Enviar mensaje privado
		privateMessageForm.onsubmit = async (e) => {
			e.preventDefault();
			const text = privateMessageText.value.trim();
			if (!text) return;
			const userDoc = await window.db.collection('users').doc(currentUser.uid).get();
			const profile = userDoc.exists ? userDoc.data() : { name: currentUser.displayName || currentUser.email };
			 await window.db.collection('privateChats').doc(chatId).collection('messages').add({
				text,
				from: currentUser.uid,
				name: profile.name || currentUser.displayName || currentUser.email,
				date: firebase.firestore.FieldValue.serverTimestamp()
			});
			privateMessageForm.reset();
		};
	}
});
