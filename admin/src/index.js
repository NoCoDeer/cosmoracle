const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const fs = require('fs');
const multer = require('multer');
const dayjs = require('dayjs');
const axios = require('axios');
const cors = require('cors');

// Загрузка переменных окружения
dotenv.config();

// Инициализация приложения
const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

// Настройка базы данных
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Проверка соединения с базой данных
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err);
  } else {
    console.log('Успешное подключение к базе данных');
  }
});

// Настройка middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://code.jquery.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.openrouter.ai'],
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'data:'],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Настройка сессий
app.use(session({
  secret: process.env.SESSION_SECRET || 'cosmooracle-admin-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 часа
  },
}));

// Настройка статических файлов
app.use(express.static(path.join(__dirname, '../public')));

// Настройка шаблонизатора
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Настройка загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (ext && mimetype) {
      return cb(null, true);
    }
    
    cb(new Error('Разрешены только изображения (jpeg, jpg, png, gif, webp)'));
  },
});

// Middleware для проверки аутентификации
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  
  res.redirect('/login');
};

// Middleware для добавления пользователя в res.locals
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Маршруты аутентификации
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  
  res.render('login', {
    error: req.query.error || '',
    success: req.query.success || '',
  });
});

app.post('/login', async (req, res) => {
  const { email, password, remember } = req.body;
  
  try {
    // Проверка наличия email и пароля
    if (!email || !password) {
      return res.render('login', {
        error: 'Пожалуйста, введите email и пароль',
        success: '',
      });
    }
    
    // Поиск пользователя в базе данных
    const result = await pool.query(
      'SELECT * FROM admins WHERE email = $1',
      [email]
    );
    
    const user = result.rows[0];
    
    // Проверка наличия пользователя и правильности пароля
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.render('login', {
        error: 'Неверный email или пароль',
        success: '',
      });
    }
    
    // Проверка активности пользователя
    if (!user.is_active) {
      return res.render('login', {
        error: 'Ваша учетная запись заблокирована. Обратитесь к администратору.',
        success: '',
      });
    }
    
    // Обновление времени последнего входа
    await pool.query(
      'UPDATE admins SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );
    
    // Установка сессии
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
    };
    
    // Установка cookie для "запомнить меня"
    if (remember) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 дней
    }
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Ошибка при входе:', err);
    res.render('login', {
      error: 'Произошла ошибка при входе. Пожалуйста, попробуйте еще раз.',
      success: '',
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Ошибка при выходе:', err);
    }
    res.redirect('/login');
  });
});

app.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', {
    error: req.query.error || '',
    success: req.query.success || '',
  });
});

app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  try {
    // Проверка наличия email
    if (!email) {
      return res.render('auth/forgot-password', {
        error: 'Пожалуйста, введите email',
        success: '',
      });
    }
    
    // Поиск пользователя в базе данных
    const result = await pool.query(
      'SELECT * FROM admins WHERE email = $1',
      [email]
    );
    
    const user = result.rows[0];
    
    // Даже если пользователь не найден, мы не сообщаем об этом
    // для предотвращения утечки информации
    if (!user) {
      return res.render('auth/forgot-password', {
        error: '',
        success: 'Если указанный email зарегистрирован в системе, на него будет отправлена инструкция по сбросу пароля.',
      });
    }
    
    // Генерация токена для сброса пароля
    const resetToken = uuidv4();
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 час
    
    // Сохранение токена в базе данных
    await pool.query(
      'UPDATE admins SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, resetTokenExpires, user.id]
    );
    
    // В реальном приложении здесь должна быть отправка email
    // с инструкцией по сбросу пароля
    console.log(`Токен сброса пароля для ${email}: ${resetToken}`);
    
    res.render('auth/forgot-password', {
      error: '',
      success: 'Инструкция по сбросу пароля отправлена на указанный email.',
    });
  } catch (err) {
    console.error('Ошибка при запросе сброса пароля:', err);
    res.render('auth/forgot-password', {
      error: 'Произошла ошибка. Пожалуйста, попробуйте еще раз.',
      success: '',
    });
  }
});

app.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    // Поиск пользователя по токену
    const result = await pool.query(
      'SELECT * FROM admins WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    
    const user = result.rows[0];
    
    // Проверка наличия пользователя и срока действия токена
    if (!user) {
      return res.redirect('/login?error=Недействительный или истекший токен сброса пароля');
    }
    
    res.render('auth/reset-password', {
      token,
      error: req.query.error || '',
      success: '',
    });
  } catch (err) {
    console.error('Ошибка при проверке токена сброса пароля:', err);
    res.redirect('/login?error=Произошла ошибка. Пожалуйста, попробуйте еще раз.');
  }
});

app.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password, password_confirm } = req.body;
  
  try {
    // Проверка наличия пароля и подтверждения
    if (!password || !password_confirm) {
      return res.render('auth/reset-password', {
        token,
        error: 'Пожалуйста, введите пароль и подтверждение',
        success: '',
      });
    }
    
    // Проверка совпадения паролей
    if (password !== password_confirm) {
      return res.render('auth/reset-password', {
        token,
        error: 'Пароли не совпадают',
        success: '',
      });
    }
    
    // Проверка длины пароля
    if (password.length < 8) {
      return res.render('auth/reset-password', {
        token,
        error: 'Пароль должен содержать не менее 8 символов',
        success: '',
      });
    }
    
    // Поиск пользователя по токену
    const result = await pool.query(
      'SELECT * FROM admins WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    
    const user = result.rows[0];
    
    // Проверка наличия пользователя и срока действия токена
    if (!user) {
      return res.redirect('/login?error=Недействительный или истекший токен сброса пароля');
    }
    
    // Хеширование нового пароля
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Обновление пароля и сброс токена
    await pool.query(
      'UPDATE admins SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );
    
    res.redirect('/login?success=Пароль успешно изменен. Теперь вы можете войти с новым паролем.');
  } catch (err) {
    console.error('Ошибка при сбросе пароля:', err);
    res.render('auth/reset-password', {
      token,
      error: 'Произошла ошибка. Пожалуйста, попробуйте еще раз.',
      success: '',
    });
  }
});

// Маршруты панели управления
app.get('/', isAuthenticated, (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    // Получение статистики
    const totalUsersResult = await pool.query('SELECT COUNT(*) FROM users');
    const premiumUsersResult = await pool.query("SELECT COUNT(*) FROM users WHERE subscription_type = 'premium'");
    const todayRevenueResult = await pool.query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed'");
    const horoscopesGeneratedResult = await pool.query('SELECT COUNT(*) FROM horoscopes');
    
    // Получение данных для графиков
    const userChartLabels = [];
    const userChartData = [];
    const premiumChartData = [];
    
    // Последние 7 дней
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const formattedDate = dayjs(date).format('DD.MM');
      userChartLabels.push(formattedDate);
      
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const newUsersResult = await pool.query(
        'SELECT COUNT(*) FROM users WHERE created_at >= $1 AND created_at <= $2',
        [startOfDay, endOfDay]
      );
      
      const newPremiumResult = await pool.query(
        "SELECT COUNT(*) FROM users WHERE subscription_type = 'premium' AND subscription_start_date >= $1 AND subscription_start_date <= $2",
        [startOfDay, endOfDay]
      );
      
      userChartData.push(parseInt(newUsersResult.rows[0].count));
      premiumChartData.push(parseInt(newPremiumResult.rows[0].count));
    }
    
    // Получение данных для круговой диаграммы подписок
    const freeUsersResult = await pool.query("SELECT COUNT(*) FROM users WHERE subscription_type = 'free' OR subscription_type IS NULL");
    
    // Получение данных для графика запросов к AI
    const aiQueryCategoriesResult = await pool.query(
      "SELECT category, COUNT(*) FROM ai_queries GROUP BY category ORDER BY COUNT(*) DESC LIMIT 5"
    );
    
    const aiQueryCategories = aiQueryCategoriesResult.rows.map(row => row.category);
    const aiQueryCounts = aiQueryCategoriesResult.rows.map(row => parseInt(row.count));
    
    // Получение данных для графика знаков зодиака
    const zodiacCountsResult = await pool.query(
      "SELECT zodiac_sign, COUNT(*) FROM users WHERE zodiac_sign IS NOT NULL GROUP BY zodiac_sign ORDER BY zodiac_sign"
    );
    
    const zodiacCounts = Array(12).fill(0);
    const zodiacSigns = [
      'Овен', 'Телец', 'Близнецы', 'Рак', 
      'Лев', 'Дева', 'Весы', 'Скорпион', 
      'Стрелец', 'Козерог', 'Водолей', 'Рыбы'
    ];
    
    zodiacCountsResult.rows.forEach(row => {
      const index = zodiacSigns.indexOf(row.zodiac_sign);
      if (index !== -1) {
        zodiacCounts[index] = parseInt(row.count);
      }
    });
    
    // Получение последних регистраций
    const recentUsersResult = await pool.query(
      'SELECT id, name, email, telegram_username, auth_type, avatar_url, created_at FROM users ORDER BY created_at DESC LIMIT 5'
    );
    
    // Получение последних платежей
    const recentPaymentsResult = await pool.query(
      'SELECT p.id, p.user_id, u.name as user_name, p.amount, p.currency, p.payment_method, p.created_at FROM payments p JOIN users u ON p.user_id = u.id WHERE p.status = $1 ORDER BY p.created_at DESC LIMIT 5',
      ['completed']
    );
    
    const stats = {
      totalUsers: parseInt(totalUsersResult.rows[0].count),
      premiumUsers: parseInt(premiumUsersResult.rows[0].count),
      todayRevenue: parseFloat(todayRevenueResult.rows[0].coalesce),
      horoscopesGenerated: parseInt(horoscopesGeneratedResult.rows[0].count),
      userChartLabels,
      userChartData,
      premiumChartData,
      freeUsers: parseInt(freeUsersResult.rows[0].count),
      aiQueryCategories,
      aiQueryCounts,
      zodiacCounts,
    };
    
    res.render('dashboard', {
      title: 'Панель управления',
      activePage: 'dashboard',
      stats,
      recentUsers: recentUsersResult.rows,
      recentPayments: recentPaymentsResult.rows,
      notifications: [],
      success: req.query.success || '',
      error: req.query.error || '',
    });
  } catch (err) {
    console.error('Ошибка при загрузке панели управления:', err);
    res.render('dashboard', {
      title: 'Панель управления',
      activePage: 'dashboard',
      stats: {
        totalUsers: 0,
        premiumUsers: 0,
        todayRevenue: 0,
        horoscopesGenerated: 0,
        userChartLabels: [],
        userChartData: [],
        premiumChartData: [],
        freeUsers: 0,
        aiQueryCategories: [],
        aiQueryCounts: [],
        zodiacCounts: Array(12).fill(0),
      },
      recentUsers: [],
      recentPayments: [],
      notifications: [],
      success: '',
      error: 'Произошла ошибка при загрузке данных. Пожалуйста, попробуйте обновить страницу.',
    });
  }
});

// Маршруты для пользователей
app.get('/users', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';
    
    // Формирование условий фильтрации
    let whereClause = '';
    const queryParams = [];
    
    if (search) {
      whereClause = 'WHERE (name ILIKE $1 OR email ILIKE $1 OR telegram_username ILIKE $1)';
      queryParams.push(`%${search}%`);
    }
    
    if (filter === 'active') {
      whereClause = whereClause ? `${whereClause} AND is_active = true` : 'WHERE is_active = true';
    } else if (filter === 'inactive') {
      whereClause = whereClause ? `${whereClause} AND is_active = false` : 'WHERE is_active = false';
    } else if (filter === 'premium') {
      whereClause = whereClause ? `${whereClause} AND subscription_type = 'premium'` : "WHERE subscription_type = 'premium'";
    } else if (filter === 'free') {
      whereClause = whereClause ? `${whereClause} AND (subscription_type = 'free' OR subscription_type IS NULL)` : "WHERE (subscription_type = 'free' OR subscription_type IS NULL)";
    } else if (filter === 'recent') {
      whereClause = whereClause ? `${whereClause} AND created_at >= NOW() - INTERVAL '7 days'` : "WHERE created_at >= NOW() - INTERVAL '7 days'";
    }
    
    // Получение пользователей с пагинацией
    const usersQuery = `
      SELECT id, name, email, telegram_username, auth_type, avatar_url, created_at, is_active, subscription_type, subscription_end_date
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    
    const usersResult = await pool.query(
      usersQuery,
      [...queryParams, limit, offset]
    );
    
    // Получение общего количества пользователей для пагинации
    const countQuery = `
      SELECT COUNT(*)
      FROM users
      ${whereClause}
    `;
    
    const countResult = await pool.query(
      countQuery,
      queryParams
    );
    
    const totalUsers = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalUsers / limit);
    
    // Получение статистики для фильтров
    const countsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS all_count,
        (SELECT COUNT(*) FROM users WHERE is_active = true) AS active_count,
        (SELECT COUNT(*) FROM users WHERE is_active = false) AS inactive_count,
        (SELECT COUNT(*) FROM users WHERE subscription_type = 'premium') AS premium_count,
        (SELECT COUNT(*) FROM users WHERE subscription_type = 'free' OR subscription_type IS NULL) AS free_count,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS recent_count
    `);
    
    const counts = {
      all: parseInt(countsResult.rows[0].all_count),
      active: parseInt(countsResult.rows[0].active_count),
      inactive: parseInt(countsResult.rows[0].inactive_count),
      premium: parseInt(countsResult.rows[0].premium_count),
      free: parseInt(countsResult.rows[0].free_count),
      recent: parseInt(countsResult.rows[0].recent_count),
    };
    
    res.render('users/index', {
      title: 'Пользователи',
      activePage: 'users',
      users: usersResult.rows,
      currentPage: page,
      totalPages,
      search,
      filter,
      counts,
      notifications: [],
      success: req.query.success || '',
      error: req.query.error || '',
    });
  } catch (err) {
    console.error('Ошибка при загрузке списка пользователей:', err);
    res.render('users/index', {
      title: 'Пользователи',
      activePage: 'users',
      users: [],
      currentPage: 1,
      totalPages: 1,
      search: '',
      filter: 'all',
      counts: { all: 0, active: 0, inactive: 0, premium: 0, free: 0, recent: 0 },
      notifications: [],
      success: '',
      error: 'Произошла ошибка при загрузке данных. Пожалуйста, попробуйте обновить страницу.',
    });
  }
});

app.get('/users/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Получение данных пользователя
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).render('error', {
        title: 'Ошибка',
        statusCode: 404,
        message: 'Пользователь не найден',
        description: 'Запрашиваемый пользователь не существует или был удален.',
        notifications: [],
        currentUser: req.session.user,
      });
    }
    
    const user = userResult.rows[0];
    
    // Получение платежей пользователя
    const paymentsResult = await pool.query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
      [id]
    );
    
    // Получение гороскопов пользователя
    const horoscopesResult = await pool.query(
      'SELECT * FROM horoscopes WHERE user_id = $1 ORDER BY date DESC',
      [id]
    );
    
    // Получение раскладов Таро пользователя
    const tarotReadingsResult = await pool.query(
      'SELECT * FROM tarot_readings WHERE user_id = $1 ORDER BY created_at DESC',
      [id]
    );
    
    // Получение сообщений чата с астрологом
    const chatMessagesResult = await pool.query(
      'SELECT * FROM ai_chat_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [id]
    );
    
    res.render('users/view', {
      title: `Пользователь: ${user.name}`,
      activePage: 'users',
      user,
      payments: paymentsResult.rows,
      horoscopes: horoscopesResult.rows,
      tarotReadings: tarotReadingsResult.rows,
      chatMessages: chatMessagesResult.rows,
      notifications: [],
      success: req.query.success || '',
      error: req.query.error || '',
    });
  } catch (err) {
    console.error('Ошибка при загрузке данных пользователя:', err);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Ошибка сервера',
      description: 'Произошла ошибка при загрузке данных пользователя. Пожалуйста, попробуйте еще раз.',
      error: process.env.NODE_ENV !== 'production' ? err : null,
      notifications: [],
      currentUser: req.session.user,
    });
  }
});

app.get('/users/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Получение данных пользователя
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).render('error', {
        title: 'Ошибка',
        statusCode: 404,
        message: 'Пользователь не найден',
        description: 'Запрашиваемый пользователь не существует или был удален.',
        notifications: [],
        currentUser: req.session.user,
      });
    }
    
    const user = userResult.rows[0];
    
    res.render('users/edit', {
      title: `Редактирование пользователя: ${user.name}`,
      activePage: 'users',
      user,
      notifications: [],
      success: req.query.success || '',
      error: req.query.error || '',
    });
  } catch (err) {
    console.error('Ошибка при загрузке формы редактирования пользователя:', err);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Ошибка сервера',
      description: 'Произошла ошибка при загрузке формы редактирования пользователя. Пожалуйста, попробуйте еще раз.',
      error: process.env.NODE_ENV !== 'production' ? err : null,
      notifications: [],
      currentUser: req.session.user,
    });
  }
});

app.post('/users/:id/update', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      language,
      is_active,
      password,
      birth_date,
      birth_time,
      birth_place,
      notification_time,
      subscription_type,
      subscription_end_date,
      auto_renewal,
      referral_code,
      referral_bonus_days,
      notes,
    } = req.body;
    
    // Проверка существования пользователя
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).render('error', {
        title: 'Ошибка',
        statusCode: 404,
        message: 'Пользователь не найден',
        description: 'Запрашиваемый пользователь не существует или был удален.',
        notifications: [],
        currentUser: req.session.user,
      });
    }
    
    // Обновление данных пользователя
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    if (name) {
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(name);
      paramIndex++;
    }
    
    if (email) {
      updateFields.push(`email = $${paramIndex}`);
      updateValues.push(email);
      paramIndex++;
    }
    
    if (phone) {
      updateFields.push(`phone = $${paramIndex}`);
      updateValues.push(phone);
      paramIndex++;
    }
    
    if (language) {
      updateFields.push(`language = $${paramIndex}`);
      updateValues.push(language);
      paramIndex++;
    }
    
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex}`);
      updateValues.push(is_active === 'true' || is_active === true);
      paramIndex++;
    }
    
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateFields.push(`password_hash = $${paramIndex}`);
      updateValues.push(passwordHash);
      paramIndex++;
    }
    
    if (birth_date) {
      updateFields.push(`birth_date = $${paramIndex}`);
      updateValues.push(birth_date);
      paramIndex++;
    }
    
    if (birth_time) {
      updateFields.push(`birth_time = $${paramIndex}`);
      updateValues.push(birth_time);
      paramIndex++;
    }
    
    if (birth_place) {
      updateFields.push(`birth_place = $${paramIndex}`);
      updateValues.push(birth_place);
      paramIndex++;
    }
    
    if (notification_time) {
      updateFields.push(`notification_time = $${paramIndex}`);
      updateValues.push(notification_time);
      paramIndex++;
    }
    
    if (subscription_type) {
      updateFields.push(`subscription_type = $${paramIndex}`);
      updateValues.push(subscription_type);
      paramIndex++;
    }
    
    if (subscription_end_date) {
      updateFields.push(`subscription_end_date = $${paramIndex}`);
      updateValues.push(subscription_end_date);
      paramIndex++;
    }
    
    if (auto_renewal !== undefined) {
      updateFields.push(`auto_renewal = $${paramIndex}`);
      updateValues.push(auto_renewal === 'true' || auto_renewal === true);
      paramIndex++;
    }
    
    if (referral_code) {
      updateFields.push(`referral_code = $${paramIndex}`);
      updateValues.push(referral_code);
      paramIndex++;
    }
    
    if (referral_bonus_days) {
      updateFields.push(`referral_bonus_days = $${paramIndex}`);
      updateValues.push(parseInt(referral_bonus_days));
      paramIndex++;
    }
    
    if (notes) {
      updateFields.push(`notes = $${paramIndex}`);
      updateValues.push(notes);
      paramIndex++;
    }
    
    // Обновление времени изменения
    updateFields.push(`updated_at = $${paramIndex}`);
    updateValues.push(new Date());
    paramIndex++;
    
    // Выполнение запроса на обновление
    if (updateFields.length > 0) {
      const updateQuery = `
        UPDATE users
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;
      
      await pool.query(updateQuery, [...updateValues, id]);
    }
    
    res.redirect(`/users/${id}?success=Пользователь успешно обновлен`);
  } catch (err) {
    console.error('Ошибка при обновлении пользователя:', err);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Ошибка сервера',
      description: 'Произошла ошибка при обновлении пользователя. Пожалуйста, попробуйте еще раз.',
      error: process.env.NODE_ENV !== 'production' ? err : null,
      notifications: [],
      currentUser: req.session.user,
    });
  }
});

// Активация/деактивация пользователя
app.get('/users/:id/activate', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1',
      [id]
    );
    
    res.redirect(`/users/${id}?success=Пользователь успешно активирован`);
  } catch (err) {
    console.error('Ошибка при активации пользователя:', err);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Ошибка сервера',
      description: 'Произошла ошибка при активации пользователя. Пожалуйста, попробуйте еще раз.',
      error: process.env.NODE_ENV !== 'production' ? err : null,
      notifications: [],
      currentUser: req.session.user,
    });
  }
});

app.get('/users/:id/deactivate', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );
    
    res.redirect(`/users/${id}?success=Пользователь успешно заблокирован`);
  } catch (err) {
    console.error('Ошибка при блокировке пользователя:', err);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Ошибка сервера',
      description: 'Произошла ошибка при блокировке пользователя. Пожалуйста, попробуйте еще раз.',
      error: process.env.NODE_ENV !== 'production' ? err : null,
      notifications: [],
      currentUser: req.session.user,
    });
  }
});

// Удаление пользователя
app.get('/users/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Удаление пользователя
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.redirect('/users?success=Пользователь успешно удален');
  } catch (err) {
    console.error('Ошибка при удалении пользователя:', err);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Ошибка сервера',
      description: 'Произошла ошибка при удалении пользователя. Пожалуйста, попробуйте еще раз.',
      error: process.env.NODE_ENV !== 'production' ? err : null,
      notifications: [],
      currentUser: req.session.user,
    });
  }
});

// Обработка ошибок
app.use((req, res, next) => {
  res.status(404).render('error', {
    title: 'Ошибка',
    statusCode: 404,
    message: 'Страница не найдена',
    description: 'Запрашиваемая страница не существует или была перемещена.',
    notifications: [],
    currentUser: req.session.user,
  });
});

app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  
  res.status(500).render('error', {
    title: 'Ошибка',
    statusCode: 500,
    message: 'Ошибка сервера',
    description: 'Произошла внутренняя ошибка сервера. Пожалуйста, попробуйте еще раз позже.',
    error: process.env.NODE_ENV !== 'production' ? err : null,
    notifications: [],
    currentUser: req.session.user,
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Админ-панель запущена на порту ${PORT}`);
});
