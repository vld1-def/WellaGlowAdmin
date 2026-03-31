// js/staff-auth.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('staffLoginForm');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const phone = document.getElementById('staffPhone').value.trim();
        const password = document.getElementById('staffPassword').value;

        const btn = loginForm.querySelector('button');
        btn.innerText = "ПЕРЕВІРКА...";
        btn.disabled = true;

        try {
            // 1. Шукаємо в таблиці staff
            const { data: user, error } = await window.db
                .from('staff')
                .select('*')
                .eq('phone', phone)
                .eq('password', password)
                .eq('is_active', true)
                .single();

            if (error || !user) throw new Error("Доступ заборонено або дані невірні");

            // 2. Зберігаємо дані сесії персоналу
            localStorage.setItem('wella_staff_id', user.id);
            localStorage.setItem('wella_staff_role', user.role);
            localStorage.setItem('wella_staff_name', user.name);

            // 3. Розумний редірект залежно від ролі
            if (user.role === 'owner') {
                window.location.href = 'owner-dashboard.html';
            } else if (user.role === 'admin') {
                window.location.href = 'admin-calendar.html';
            } else {
                window.location.href = 'master-dashboard.html';
            }

        } catch (err) {
            alert(err.message);
            btn.innerText = "Авторизуватись";
            btn.disabled = false;
        }
    });
});
