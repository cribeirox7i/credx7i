/* eslint-disable camelcase */

exports.shorthands = undefined;

// gen_random_uuid() é função do core no Postgres 13+ (Supabase roda 15+), então não é
// preciso CREATE EXTENSION (que exigiria superusuário). Esta migration só falha cedo e
// com mensagem clara se, por algum motivo, a função não estiver disponível.
exports.up = (pgm) => {
  pgm.sql("DO $$ BEGIN PERFORM gen_random_uuid(); END $$;");
};

exports.down = () => {
  // nada a desfazer
};
