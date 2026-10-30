-- RF-003: baseline MySQL 8.4. Generado desde model.cjs; no editar después de aplicar.
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `name` LONGTEXT NOT NULL,
  `email` VARCHAR(254) NOT NULL UNIQUE,
  `password_hash` LONGTEXT NOT NULL,
  `role` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `ck_users_role` CHECK (`role` IN ('admin','barbero','cliente')),
  `phone` LONGTEXT NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `barbers` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  CONSTRAINT `fk_barbers_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (id) ON DELETE CASCADE,
  `specialty` LONGTEXT NULL,
  `photo_url` LONGTEXT NULL,
  `active` BIGINT NULL DEFAULT 1,
  CONSTRAINT `ck_barbers_active` CHECK (`active` >= 0),
  CONSTRAINT `cb_barbers_active` CHECK (`active` IN (0,1)),
  `work_start` TIME(0) NULL DEFAULT '09:00',
  `work_end` TIME(0) NULL DEFAULT '22:00',
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `clients` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  CONSTRAINT `fk_clients_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (id) ON DELETE CASCADE,
  `loyalty_points` BIGINT NULL DEFAULT 0,
  CONSTRAINT `ck_clients_loyalty_points` CHECK (`loyalty_points` >= 0),
  `loyalty_level` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT 'Bronce',
  CONSTRAINT `ck_clients_loyalty_level` CHECK (`loyalty_level` IN ('Bronce','Plata','Oro','Black')),
  `birthday` LONGTEXT NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `services` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `name` LONGTEXT NOT NULL,
  `price` BIGINT NOT NULL,
  CONSTRAINT `ck_services_price` CHECK (`price` >= 0),
  `duration_minutes` BIGINT NOT NULL,
  CONSTRAINT `ck_services_duration_minutes` CHECK (`duration_minutes` >= 1),
  `description` LONGTEXT NULL,
  `active` BIGINT NULL DEFAULT 1,
  CONSTRAINT `ck_services_active` CHECK (`active` >= 0),
  CONSTRAINT `cb_services_active` CHECK (`active` IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `name` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `price` BIGINT NOT NULL,
  CONSTRAINT `ck_products_price` CHECK (`price` >= 0),
  `image_url` LONGTEXT NULL,
  `stock` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `ck_products_stock` CHECK (`stock` >= 0),
  `category` LONGTEXT NULL,
  `active` BIGINT NULL DEFAULT 1,
  CONSTRAINT `ck_products_active` CHECK (`active` >= 0),
  CONSTRAINT `cb_products_active` CHECK (`active` IN (0,1)),
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `cost_price` BIGINT NULL,
  CONSTRAINT `ck_products_cost_price` CHECK (`cost_price` >= 0),
  `updated_at` DATETIME(6) NULL,
  INDEX `ix_products_0` (`active`,`price`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `reservations` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `client_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_reservations_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (id) ON DELETE CASCADE,
  `barber_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_reservations_barber_id` FOREIGN KEY (`barber_id`) REFERENCES `barbers` (id) ON DELETE CASCADE,
  `service_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_reservations_service_id` FOREIGN KEY (`service_id`) REFERENCES `services` (id) ON DELETE RESTRICT,
  `date` DATE NOT NULL,
  `start_time` TIME(0) NOT NULL,
  `end_time` TIME(0) NOT NULL,
  `status` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'confirmed',
  CONSTRAINT `ck_reservations_status` CHECK (`status` IN ('confirmed','cancelled','completed','no_show')),
  `notes` LONGTEXT NULL,
  `notified_24h` BIGINT NULL DEFAULT 0,
  CONSTRAINT `ck_reservations_notified_24h` CHECK (`notified_24h` >= 0),
  CONSTRAINT `cb_reservations_notified_24h` CHECK (`notified_24h` IN (0,1)),
  `notified_2h` BIGINT NULL DEFAULT 0,
  CONSTRAINT `ck_reservations_notified_2h` CHECK (`notified_2h` >= 0),
  CONSTRAINT `cb_reservations_notified_2h` CHECK (`notified_2h` IN (0,1)),
  `service_name_snapshot` LONGTEXT NULL,
  `service_price_snapshot` BIGINT NULL,
  CONSTRAINT `ck_reservations_service_price_snapshot` CHECK (`service_price_snapshot` >= 0),
  `service_duration_snapshot` BIGINT NULL,
  CONSTRAINT `ck_reservations_service_duration_snapshot` CHECK (`service_duration_snapshot` >= 0),
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `starts_at` DATETIME(6) NULL,
  `ends_at` DATETIME(6) NULL,
  INDEX `ix_reservations_0` (`barber_id`,`date`,`status`),
  INDEX `ix_reservations_1` (`client_id`,`status`),
  INDEX `ix_reservations_2` (`status`,`date`,`notified_24h`,`notified_2h`),
  INDEX `ix_reservations_3` (`barber_id`,`starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `product_name` LONGTEXT NOT NULL,
  `quantity` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `ck_inventory_quantity` CHECK (`quantity` >= 0),
  `min_threshold` BIGINT NOT NULL DEFAULT 5,
  CONSTRAINT `ck_inventory_min_threshold` CHECK (`min_threshold` >= 0),
  `requested_by` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_inventory_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `barbers` (id) ON DELETE RESTRICT,
  `request_status` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT 'none',
  CONSTRAINT `ck_inventory_request_status` CHECK (`request_status` IN ('none','pending','approved','rejected')),
  `updated_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `product_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  CONSTRAINT `fk_inventory_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `haircut_photos` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `barber_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_haircut_photos_barber_id` FOREIGN KEY (`barber_id`) REFERENCES `barbers` (id) ON DELETE CASCADE,
  `client_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_haircut_photos_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (id) ON DELETE RESTRICT,
  `reservation_id` LONGTEXT NULL,
  `photo_url` LONGTEXT NOT NULL,
  `type` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `ck_haircut_photos_type` CHECK (`type` IN ('antes','despues')),
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notes` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `barber_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_notes_barber_id` FOREIGN KEY (`barber_id`) REFERENCES `barbers` (id) ON DELETE CASCADE,
  `client_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_notes_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (id) ON DELETE RESTRICT,
  `content` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `promotions` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `title` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `segment` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `ck_promotions_segment` CHECK (`segment` IN ('nuevos','recurrentes','inactivos','vip','cumpleanos','todos')),
  `active` BIGINT NULL DEFAULT 1,
  CONSTRAINT `ck_promotions_active` CHECK (`active` >= 0),
  CONSTRAINT `cb_promotions_active` CHECK (`active` IN (0,1)),
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_notifications_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (id) ON DELETE CASCADE,
  `reservation_id` LONGTEXT NULL,
  `channel` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'email',
  CONSTRAINT `ck_notifications_channel` CHECK (`channel` IN ('email','whatsapp','sms')),
  `type` LONGTEXT NOT NULL,
  `message` LONGTEXT NOT NULL,
  `status` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'sent',
  CONSTRAINT `ck_notifications_status` CHECK (`status` IN ('sent','simulated','failed')),
  `read` BIGINT NULL DEFAULT 0,
  CONSTRAINT `ck_notifications_read` CHECK (`read` >= 0),
  CONSTRAINT `cb_notifications_read` CHECK (`read` IN (0,1)),
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `client_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_orders_client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (id) ON DELETE RESTRICT,
  `buy_order` VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL UNIQUE,
  `session_id` LONGTEXT NOT NULL,
  `items` JSON NOT NULL,
  `total` BIGINT NOT NULL,
  CONSTRAINT `ck_orders_total` CHECK (`total` >= 0),
  `status` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  CONSTRAINT `ck_orders_status` CHECK (`status` IN ('pending','paid','failed','cancelled')),
  `mp_preference_id` LONGTEXT NULL,
  `mp_payment_id` LONGTEXT NULL,
  `payment_detail` JSON NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `webpay_token` LONGTEXT NULL,
  INDEX `ix_orders_0` (`client_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `order_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_order_items_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (id) ON DELETE RESTRICT,
  `product_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_order_items_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (id) ON DELETE RESTRICT,
  `product_name` LONGTEXT NOT NULL,
  `unit_price` BIGINT NOT NULL,
  CONSTRAINT `ck_order_items_unit_price` CHECK (`unit_price` >= 0),
  `quantity` BIGINT NOT NULL,
  CONSTRAINT `ck_order_items_quantity` CHECK (`quantity` >= 1),
  `unit_cost` BIGINT NULL,
  CONSTRAINT `ck_order_items_unit_cost` CHECK (`unit_cost` >= 0),
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `ix_order_items_0` (`order_id`),
  INDEX `ix_order_items_1` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchases` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `supplier` LONGTEXT NULL,
  `invoice_number` LONGTEXT NULL,
  `invoice_file_url` LONGTEXT NULL,
  `items` JSON NOT NULL,
  `total_cost` BIGINT NOT NULL,
  CONSTRAINT `ck_purchases_total_cost` CHECK (`total_cost` >= 0),
  `created_by` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_purchases_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (id) ON DELETE RESTRICT,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_items` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `purchase_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_purchase_items_purchase_id` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (id) ON DELETE RESTRICT,
  `product_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_purchase_items_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (id) ON DELETE RESTRICT,
  `product_name` LONGTEXT NOT NULL,
  `quantity` BIGINT NOT NULL,
  CONSTRAINT `ck_purchase_items_quantity` CHECK (`quantity` >= 1),
  `unit_cost` BIGINT NOT NULL,
  CONSTRAINT `ck_purchase_items_unit_cost` CHECK (`unit_cost` >= 0),
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `ix_purchase_items_0` (`purchase_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `product_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `fk_stock_movements_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (id) ON DELETE RESTRICT,
  `movement_type` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `ck_stock_movements_movement_type` CHECK (`movement_type` IN ('purchase','sale','adjustment','return','waste')),
  `quantity_delta` BIGINT NOT NULL,
  `unit_cost` BIGINT NULL,
  CONSTRAINT `ck_stock_movements_unit_cost` CHECK (`unit_cost` >= 0),
  `reference_type` LONGTEXT NULL,
  `reference_id` LONGTEXT NULL,
  `created_by` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_stock_movements_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (id) ON DELETE SET NULL,
  `note` LONGTEXT NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `ix_stock_movements_0` (`product_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `actor_user_id` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT `fk_audit_log_actor_user_id` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (id) ON DELETE SET NULL,
  `entity_type` VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
  `entity_id` VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
  `action` LONGTEXT NOT NULL,
  `before_data` JSON NULL,
  `after_data` JSON NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `ix_audit_log_0` (`entity_type`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
