/**
 * CosmoOracle - Backend API
 * Основной файл сервера Fastify для API
 */

require('dotenv').config();
const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV !== 'production',
  },
});

// Регистрация плагинов
fastify.register(require('@fastify/cors'), {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
});

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET || 'cosmooracle_secret_key',
  sign: {
    expiresIn: '7d',
  },
});

fastify.register(require('@fastify/swagger'), {
  routePrefix: '/documentation',
  swagger: {
    info: {
      title: 'CosmoOracle API',
      description: 'API для астрологического сервиса CosmoOracle',
      version: '1.0.0',
    },
    host: process.env.API_HOST || 'localhost:3002',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
      },
    },
  },
  exposeRoute: true,
});

fastify.register(require('@fastify/postgres'), {
  connectionString: process.env.DATABASE_URL,
});

fastify.register(require('@fastify/redis'), {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
});

// Декоратор для проверки аутентификации
fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Необходима аутентификация' });
  }
});

// Декоратор для проверки роли администратора
fastify.decorate('isAdmin', async (request, reply) => {
  try {
    await request.jwtVerify();
    if (request.user.role !== 'admin') {
      reply.code(403).send({ error: 'Доступ запрещен' });
    }
  } catch (err) {
    reply.code(401).send({ error: 'Необходима аутентификация' });
  }
});

// Регистрация маршрутов
fastify.register(require('./routes/auth'), { prefix: '/api/v1/auth' });
fastify.register(require('./routes/users'), { prefix: '/api/v1/users' });
fastify.register(require('./routes/astro'), { prefix: '/api/v1/astro' });
fastify.register(require('./routes/tarot'), { prefix: '/api/v1/tarot' });
fastify.register(require('./routes/horoscope'), { prefix: '/api/v1/horoscope' });
fastify.register(require('./routes/numerology'), { prefix: '/api/v1/numerology' });
fastify.register(require('./routes/lunar'), { prefix: '/api/v1/lunar' });
fastify.register(require('./routes/ai'), { prefix: '/api/v1/ai' });
fastify.register(require('./routes/payment'), { prefix: '/api/v1/pay' });
fastify.register(require('./routes/referral'), { prefix: '/api/v1/referral' });
fastify.register(require('./routes/admin'), { prefix: '/api/v1/admin' });

// Маршрут для проверки работоспособности API
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Маршрут для корневого URL
fastify.get('/', async () => {
  return {
    name: 'CosmoOracle API',
    version: '1.0.0',
    documentation: '/documentation',
    health: '/health',
  };
});

// Обработка ошибок
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  
  // Обработка ошибок валидации
  if (error.validation) {
    return reply.code(400).send({
      error: 'Ошибка валидации',
      message: error.message,
      details: error.validation,
    });
  }
  
  // Обработка ошибок PostgreSQL
  if (error.code && error.code.startsWith('23')) {
    return reply.code(400).send({
      error: 'Ошибка базы данных',
      message: error.message,
    });
  }
  
  // Общая обработка ошибок
  reply.code(error.statusCode || 500).send({
    error: error.name || 'Внутренняя ошибка сервера',
    message: error.message || 'Произошла непредвиденная ошибка',
  });
});

// Запуск сервера
const start = async () => {
  try {
    const port = process.env.API_PORT || 3002;
    const host = process.env.API_HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`Сервер запущен на ${host}:${port}`);
    
    // Вывод доступных маршрутов
    fastify.log.info('Доступные маршруты:');
    fastify.printRoutes();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
