import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const schema = Joi.object({
  MONGODB_NON_SRV: Joi.string().allow(''),
  MONGODB_URI: Joi.string().uri().allow(''),
  PORT: Joi.number().default(4000),
}).unknown();

const { value, error } = schema.validate(process.env);
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default {
  mongodbUri: value.MONGODB_NON_SRV || value.MONGODB_URI,
  port: value.PORT,
};
