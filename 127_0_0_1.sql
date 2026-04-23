-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 07, 2026 at 08:24 AM
-- Server version: 10.6.15-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `loan_app`
--
CREATE DATABASE IF NOT EXISTS `loan_app` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `loan_app`;

-- --------------------------------------------------------

--
-- Table structure for table `auth_group`
--

CREATE TABLE `auth_group` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `auth_group_permissions`
--

CREATE TABLE `auth_group_permissions` (
  `id` bigint(20) NOT NULL,
  `group_id` int(11) NOT NULL,
  `permission_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `auth_permission`
--

CREATE TABLE `auth_permission` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `content_type_id` int(11) NOT NULL,
  `codename` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `auth_permission`
--

INSERT INTO `auth_permission` (`id`, `name`, `content_type_id`, `codename`) VALUES
(1, 'Can add log entry', 1, 'add_logentry'),
(2, 'Can change log entry', 1, 'change_logentry'),
(3, 'Can delete log entry', 1, 'delete_logentry'),
(4, 'Can view log entry', 1, 'view_logentry'),
(5, 'Can add permission', 2, 'add_permission'),
(6, 'Can change permission', 2, 'change_permission'),
(7, 'Can delete permission', 2, 'delete_permission'),
(8, 'Can view permission', 2, 'view_permission'),
(9, 'Can add group', 3, 'add_group'),
(10, 'Can change group', 3, 'change_group'),
(11, 'Can delete group', 3, 'delete_group'),
(12, 'Can view group', 3, 'view_group'),
(13, 'Can add content type', 4, 'add_contenttype'),
(14, 'Can change content type', 4, 'change_contenttype'),
(15, 'Can delete content type', 4, 'delete_contenttype'),
(16, 'Can view content type', 4, 'view_contenttype'),
(17, 'Can add session', 5, 'add_session'),
(18, 'Can change session', 5, 'change_session'),
(19, 'Can delete session', 5, 'delete_session'),
(20, 'Can view session', 5, 'view_session'),
(21, 'Can add loan type', 6, 'add_loantype'),
(22, 'Can change loan type', 6, 'change_loantype'),
(23, 'Can delete loan type', 6, 'delete_loantype'),
(24, 'Can view loan type', 6, 'view_loantype'),
(25, 'Can add user', 7, 'add_user'),
(26, 'Can change user', 7, 'change_user'),
(27, 'Can delete user', 7, 'delete_user'),
(28, 'Can view user', 7, 'view_user'),
(29, 'Can add borrower document', 8, 'add_borrowerdocument'),
(30, 'Can change borrower document', 8, 'change_borrowerdocument'),
(31, 'Can delete borrower document', 8, 'delete_borrowerdocument'),
(32, 'Can view borrower document', 8, 'view_borrowerdocument'),
(33, 'Can add loan', 9, 'add_loan'),
(34, 'Can change loan', 9, 'change_loan'),
(35, 'Can delete loan', 9, 'delete_loan'),
(36, 'Can view loan', 9, 'view_loan'),
(37, 'Can add notification', 10, 'add_notification'),
(38, 'Can change notification', 10, 'change_notification'),
(39, 'Can delete notification', 10, 'delete_notification'),
(40, 'Can view notification', 10, 'view_notification'),
(41, 'Can add payment', 11, 'add_payment'),
(42, 'Can change payment', 11, 'change_payment'),
(43, 'Can delete payment', 11, 'delete_payment'),
(44, 'Can view payment', 11, 'view_payment');

-- --------------------------------------------------------

--
-- Table structure for table `django_admin_log`
--

CREATE TABLE `django_admin_log` (
  `id` int(11) NOT NULL,
  `action_time` datetime(6) NOT NULL,
  `object_id` longtext DEFAULT NULL,
  `object_repr` varchar(200) NOT NULL,
  `action_flag` smallint(5) UNSIGNED NOT NULL CHECK (`action_flag` >= 0),
  `change_message` longtext NOT NULL,
  `content_type_id` int(11) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `django_content_type`
--

CREATE TABLE `django_content_type` (
  `id` int(11) NOT NULL,
  `app_label` varchar(100) NOT NULL,
  `model` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `django_content_type`
--

INSERT INTO `django_content_type` (`id`, `app_label`, `model`) VALUES
(1, 'admin', 'logentry'),
(3, 'auth', 'group'),
(2, 'auth', 'permission'),
(4, 'contenttypes', 'contenttype'),
(8, 'loans', 'borrowerdocument'),
(9, 'loans', 'loan'),
(6, 'loans', 'loantype'),
(10, 'loans', 'notification'),
(11, 'loans', 'payment'),
(7, 'loans', 'user'),
(5, 'sessions', 'session');

-- --------------------------------------------------------

--
-- Table structure for table `django_migrations`
--

CREATE TABLE `django_migrations` (
  `id` bigint(20) NOT NULL,
  `app` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `applied` datetime(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `django_migrations`
--

INSERT INTO `django_migrations` (`id`, `app`, `name`, `applied`) VALUES
(1, 'contenttypes', '0001_initial', '2026-03-06 16:34:18.933300'),
(2, 'contenttypes', '0002_remove_content_type_name', '2026-03-06 16:34:18.995031'),
(3, 'auth', '0001_initial', '2026-03-06 16:34:19.158512'),
(4, 'auth', '0002_alter_permission_name_max_length', '2026-03-06 16:34:19.194103'),
(5, 'auth', '0003_alter_user_email_max_length', '2026-03-06 16:34:19.205973'),
(6, 'auth', '0004_alter_user_username_opts', '2026-03-06 16:34:19.236161'),
(7, 'auth', '0005_alter_user_last_login_null', '2026-03-06 16:34:19.289154'),
(8, 'auth', '0006_require_contenttypes_0002', '2026-03-06 16:34:19.310761'),
(9, 'auth', '0007_alter_validators_add_error_messages', '2026-03-06 16:34:19.319306'),
(10, 'auth', '0008_alter_user_username_max_length', '2026-03-06 16:34:19.328847'),
(11, 'auth', '0009_alter_user_last_name_max_length', '2026-03-06 16:34:19.353549'),
(12, 'auth', '0010_alter_group_name_max_length', '2026-03-06 16:34:19.373804'),
(13, 'auth', '0011_update_proxy_permissions', '2026-03-06 16:34:19.382805'),
(14, 'auth', '0012_alter_user_first_name_max_length', '2026-03-06 16:34:19.392866'),
(15, 'loans', '0001_initial', '2026-03-06 16:34:20.019298'),
(16, 'admin', '0001_initial', '2026-03-06 16:34:20.116758'),
(17, 'admin', '0002_logentry_remove_auto_add', '2026-03-06 16:34:20.126284'),
(18, 'admin', '0003_logentry_add_action_flag_choices', '2026-03-06 16:34:20.137817'),
(19, 'loans', '0002_user_employment_status_user_monthly_debt_and_more', '2026-03-06 16:34:20.330486'),
(20, 'loans', '0003_user_email_verification_code_and_more', '2026-03-06 16:34:20.437561'),
(21, 'sessions', '0001_initial', '2026-03-06 16:34:20.464400'),
(22, 'loans', '0004_user_username', '2026-03-06 16:50:13.374657');

-- --------------------------------------------------------

--
-- Table structure for table `django_session`
--

CREATE TABLE `django_session` (
  `session_key` varchar(40) NOT NULL,
  `session_data` longtext NOT NULL,
  `expire_date` datetime(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `django_session`
--

INSERT INTO `django_session` (`session_key`, `session_data`, `expire_date`) VALUES
('vmgl84eo58tc7yrii0xtmzhcxuf4pj97', '.eJxVjEEOwiAQRe_C2pAhQwu4dO8ZyAwDUjU0Ke3KeHdt0oVu_3vvv1Skba1x63mJk6izCur0uzGlR247kDu126zT3NZlYr0r-qBdX2fJz8vh_h1U6vVb-4yjeOsKiocQcnJsQAwHK54JPEE2acTBOgiMgSxaKAgemWjAgur9Ad3xN3U:1vyYVC:ZljeKZyiwZmNHKGS00-SgbRCbfamtvRpyjCbNXEL-WI', '2026-03-20 16:58:14.560740');

-- --------------------------------------------------------

--
-- Table structure for table `loans_borrowerdocument`
--

CREATE TABLE `loans_borrowerdocument` (
  `id` bigint(20) NOT NULL,
  `document_type` varchar(20) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL,
  `uploaded_at` datetime(6) NOT NULL,
  `borrower_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `loans_borrowerdocument`
--

INSERT INTO `loans_borrowerdocument` (`id`, `document_type`, `file_name`, `status`, `uploaded_at`, `borrower_id`) VALUES
(3, 'id', 'national-id-john.pdf', 'verified', '2026-03-06 16:50:31.232893', 7),
(4, 'income_proof', 'payslip-john.pdf', 'uploaded', '2026-03-06 16:50:31.238904', 7);

-- --------------------------------------------------------

--
-- Table structure for table `loans_loan`
--

CREATE TABLE `loans_loan` (
  `id` bigint(20) NOT NULL,
  `borrower_name` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `interest_rate` decimal(5,2) NOT NULL,
  `term_months` int(10) UNSIGNED NOT NULL CHECK (`term_months` >= 0),
  `status` varchar(20) NOT NULL,
  `balance` decimal(12,2) NOT NULL,
  `rejection_reason` longtext NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `borrower_id` bigint(20) NOT NULL,
  `reviewed_by_id` bigint(20) DEFAULT NULL,
  `loan_type_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `loans_loan`
--

INSERT INTO `loans_loan` (`id`, `borrower_name`, `amount`, `interest_rate`, `term_months`, `status`, `balance`, `rejection_reason`, `created_at`, `updated_at`, `borrower_id`, `reviewed_by_id`, `loan_type_id`) VALUES
(3, 'John Borrower', 40000.00, 5.10, 12, 'approved', 32000.00, '', '2026-03-06 16:50:31.204905', '2026-03-06 16:50:31.204905', 7, 6, 3),
(4, 'John Borrower', 25000.00, 6.20, 12, 'pending', 25000.00, '', '2026-03-06 16:50:31.211906', '2026-03-06 16:50:31.211906', 7, NULL, 4);

-- --------------------------------------------------------

--
-- Table structure for table `loans_loantype`
--

CREATE TABLE `loans_loantype` (
  `id` bigint(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `min_amount` decimal(12,2) NOT NULL,
  `max_amount` decimal(12,2) NOT NULL,
  `base_interest_rate` decimal(5,2) NOT NULL,
  `terms_months` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`terms_months`)),
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `loans_loantype`
--

INSERT INTO `loans_loantype` (`id`, `name`, `min_amount`, `max_amount`, `base_interest_rate`, `terms_months`, `is_active`, `created_at`, `updated_at`) VALUES
(3, 'Student Loan', 5000.00, 50000.00, 4.50, '[6, 12, 24]', 1, '2026-03-06 16:50:31.192899', '2026-03-06 16:50:31.192899'),
(4, 'Business Loan', 20000.00, 150000.00, 6.20, '[12, 24, 36]', 1, '2026-03-06 16:50:31.196896', '2026-03-06 16:50:31.196896');

-- --------------------------------------------------------

--
-- Table structure for table `loans_notification`
--

CREATE TABLE `loans_notification` (
  `id` bigint(20) NOT NULL,
  `title` varchar(120) NOT NULL,
  `message` longtext NOT NULL,
  `notification_type` varchar(20) NOT NULL,
  `is_read` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `loans_notification`
--

INSERT INTO `loans_notification` (`id`, `title`, `message`, `notification_type`, `is_read`, `created_at`, `user_id`) VALUES
(3, 'Welcome', 'Welcome to Loan App. You can now apply for a loan.', 'system', 0, '2026-03-06 16:50:31.244971', 7),
(4, 'Account Created', 'Your borrower account has been created. Upload your documents and apply for a loan.', 'system', 0, '2026-03-06 16:51:26.944057', 8);

-- --------------------------------------------------------

--
-- Table structure for table `loans_payment`
--

CREATE TABLE `loans_payment` (
  `id` bigint(20) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `date` date NOT NULL,
  `note` varchar(255) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `borrower_id` bigint(20) NOT NULL,
  `loan_id` bigint(20) NOT NULL,
  `recorded_by_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `loans_payment`
--

INSERT INTO `loans_payment` (`id`, `amount`, `date`, `note`, `created_at`, `borrower_id`, `loan_id`, `recorded_by_id`) VALUES
(2, 8000.00, '2026-03-06', 'Bank transfer', '2026-03-06 16:50:31.228894', 7, 3, 6);

-- --------------------------------------------------------

--
-- Table structure for table `loans_user`
--

CREATE TABLE `loans_user` (
  `id` bigint(20) NOT NULL,
  `password` varchar(128) NOT NULL,
  `last_login` datetime(6) DEFAULT NULL,
  `is_superuser` tinyint(1) NOT NULL,
  `email` varchar(254) NOT NULL,
  `name` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `is_staff` tinyint(1) NOT NULL,
  `date_joined` datetime(6) NOT NULL,
  `employment_status` varchar(20) NOT NULL,
  `monthly_debt` decimal(12,2) DEFAULT NULL,
  `monthly_income` decimal(12,2) DEFAULT NULL,
  `phone_number` varchar(30) NOT NULL,
  `sms_notifications_enabled` tinyint(1) NOT NULL,
  `verification_status` varchar(20) NOT NULL,
  `verification_updated_at` date DEFAULT NULL,
  `email_verification_code` varchar(10) NOT NULL,
  `email_verification_expires_at` datetime(6) DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL,
  `email_verified_at` datetime(6) DEFAULT NULL,
  `username` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `loans_user`
--

INSERT INTO `loans_user` (`id`, `password`, `last_login`, `is_superuser`, `email`, `name`, `role`, `is_active`, `is_staff`, `date_joined`, `employment_status`, `monthly_debt`, `monthly_income`, `phone_number`, `sms_notifications_enabled`, `verification_status`, `verification_updated_at`, `email_verification_code`, `email_verification_expires_at`, `email_verified`, `email_verified_at`, `username`) VALUES
(5, 'pbkdf2_sha256$1000000$NW5H7SriQU5V3cg9sXbY0P$fIrTeazINlJNc7bpy+QdyOdGaXQTUgVu+BHbGFP8mSs=', NULL, 1, 'admin@loanapp.com', 'System Admin', 'admin', 1, 1, '2026-03-06 16:50:25.378427', '', NULL, NULL, '+15550001001', 0, 'not_started', NULL, '', NULL, 1, NULL, 'admin'),
(6, 'pbkdf2_sha256$1000000$W034zB0sHtK3dtqc4DMUWC$O9uQKgNlkKry/pFzgd818kgjPoZtk1UhDmlciS+XE+U=', NULL, 0, 'officer@loanapp.com', 'Loan Officer', 'officer', 1, 0, '2026-03-06 16:50:27.952409', '', NULL, NULL, '+15550001002', 0, 'not_started', NULL, '', NULL, 1, NULL, 'officer'),
(7, 'pbkdf2_sha256$1000000$lUuXyXWjaqc92iAQlQuYl5$Xo2mt10o1+qea7y9mb7P/xD+SRSRfm/jqfI4/3sx7q0=', NULL, 0, 'borrower@loanapp.com', 'John Borrower', 'borrower', 1, 0, '2026-03-06 16:50:29.590582', 'employed', 900.00, 4200.00, '+15550001003', 1, 'qualified', NULL, '', NULL, 1, NULL, 'borrower'),
(8, 'pbkdf2_sha256$1000000$eM1DVHo9Dwh9suRawGULgD$xa3wSlaEpl4SbmwbjcYenosJnHwzzzWEe6Cy+JqPzUw=', NULL, 0, 'user005124@example.com', 'Username Test', 'borrower', 1, 0, '2026-03-06 16:51:24.746305', '', NULL, NULL, '+639171234569', 1, 'not_started', NULL, '', NULL, 1, NULL, 'user005124'),
(9, 'pbkdf2_sha256$1000000$S1RXGP35PL0nDsXuLO7h49$GFtoH9FblCJcNGHEO+kwvTbASRDWVhw5Nob621qevV4=', '2026-03-06 16:58:14.558031', 1, 'loanapp@gmail.com', 'loanapp admin', 'admin', 1, 1, '2026-03-06 16:57:04.493783', '', NULL, NULL, '', 0, 'not_started', NULL, '', NULL, 1, NULL, 'loanapp');

-- --------------------------------------------------------

--
-- Table structure for table `loans_user_groups`
--

CREATE TABLE `loans_user_groups` (
  `id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `group_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `loans_user_user_permissions`
--

CREATE TABLE `loans_user_user_permissions` (
  `id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `permission_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `auth_group`
--
ALTER TABLE `auth_group`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `auth_group_permissions`
--
ALTER TABLE `auth_group_permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `auth_group_permissions_group_id_permission_id_0cd325b0_uniq` (`group_id`,`permission_id`),
  ADD KEY `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` (`permission_id`);

--
-- Indexes for table `auth_permission`
--
ALTER TABLE `auth_permission`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `auth_permission_content_type_id_codename_01ab375a_uniq` (`content_type_id`,`codename`);

--
-- Indexes for table `django_admin_log`
--
ALTER TABLE `django_admin_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `django_admin_log_content_type_id_c4bce8eb_fk_django_co` (`content_type_id`),
  ADD KEY `django_admin_log_user_id_c564eba6_fk_loans_user_id` (`user_id`);

--
-- Indexes for table `django_content_type`
--
ALTER TABLE `django_content_type`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `django_content_type_app_label_model_76bd3d3b_uniq` (`app_label`,`model`);

--
-- Indexes for table `django_migrations`
--
ALTER TABLE `django_migrations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `django_session`
--
ALTER TABLE `django_session`
  ADD PRIMARY KEY (`session_key`),
  ADD KEY `django_session_expire_date_a5c62663` (`expire_date`);

--
-- Indexes for table `loans_borrowerdocument`
--
ALTER TABLE `loans_borrowerdocument`
  ADD PRIMARY KEY (`id`),
  ADD KEY `loans_borrowerdocument_borrower_id_9faae9fb_fk_loans_user_id` (`borrower_id`);

--
-- Indexes for table `loans_loan`
--
ALTER TABLE `loans_loan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `loans_loan_borrower_id_482a8bc4_fk_loans_user_id` (`borrower_id`),
  ADD KEY `loans_loan_reviewed_by_id_e42a366a_fk_loans_user_id` (`reviewed_by_id`),
  ADD KEY `loans_loan_loan_type_id_8782e997_fk_loans_loantype_id` (`loan_type_id`);

--
-- Indexes for table `loans_loantype`
--
ALTER TABLE `loans_loantype`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `loans_notification`
--
ALTER TABLE `loans_notification`
  ADD PRIMARY KEY (`id`),
  ADD KEY `loans_notification_user_id_765b7830_fk_loans_user_id` (`user_id`);

--
-- Indexes for table `loans_payment`
--
ALTER TABLE `loans_payment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `loans_payment_borrower_id_36c830af_fk_loans_user_id` (`borrower_id`),
  ADD KEY `loans_payment_loan_id_9bc85efd_fk_loans_loan_id` (`loan_id`),
  ADD KEY `loans_payment_recorded_by_id_3a9baaee_fk_loans_user_id` (`recorded_by_id`);

--
-- Indexes for table `loans_user`
--
ALTER TABLE `loans_user`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `loans_user_groups`
--
ALTER TABLE `loans_user_groups`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `loans_user_groups_user_id_group_id_545c8a3c_uniq` (`user_id`,`group_id`),
  ADD KEY `loans_user_groups_group_id_46e74626_fk_auth_group_id` (`group_id`);

--
-- Indexes for table `loans_user_user_permissions`
--
ALTER TABLE `loans_user_user_permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `loans_user_user_permissions_user_id_permission_id_403240be_uniq` (`user_id`,`permission_id`),
  ADD KEY `loans_user_user_perm_permission_id_3baf2529_fk_auth_perm` (`permission_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `auth_group`
--
ALTER TABLE `auth_group`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `auth_group_permissions`
--
ALTER TABLE `auth_group_permissions`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `auth_permission`
--
ALTER TABLE `auth_permission`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=45;

--
-- AUTO_INCREMENT for table `django_admin_log`
--
ALTER TABLE `django_admin_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `django_content_type`
--
ALTER TABLE `django_content_type`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `django_migrations`
--
ALTER TABLE `django_migrations`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT for table `loans_borrowerdocument`
--
ALTER TABLE `loans_borrowerdocument`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `loans_loan`
--
ALTER TABLE `loans_loan`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `loans_loantype`
--
ALTER TABLE `loans_loantype`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `loans_notification`
--
ALTER TABLE `loans_notification`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `loans_payment`
--
ALTER TABLE `loans_payment`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `loans_user`
--
ALTER TABLE `loans_user`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `loans_user_groups`
--
ALTER TABLE `loans_user_groups`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `loans_user_user_permissions`
--
ALTER TABLE `loans_user_user_permissions`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `auth_group_permissions`
--
ALTER TABLE `auth_group_permissions`
  ADD CONSTRAINT `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  ADD CONSTRAINT `auth_group_permissions_group_id_b120cbf9_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`);

--
-- Constraints for table `auth_permission`
--
ALTER TABLE `auth_permission`
  ADD CONSTRAINT `auth_permission_content_type_id_2f476e4b_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`);

--
-- Constraints for table `django_admin_log`
--
ALTER TABLE `django_admin_log`
  ADD CONSTRAINT `django_admin_log_content_type_id_c4bce8eb_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`),
  ADD CONSTRAINT `django_admin_log_user_id_c564eba6_fk_loans_user_id` FOREIGN KEY (`user_id`) REFERENCES `loans_user` (`id`);

--
-- Constraints for table `loans_borrowerdocument`
--
ALTER TABLE `loans_borrowerdocument`
  ADD CONSTRAINT `loans_borrowerdocument_borrower_id_9faae9fb_fk_loans_user_id` FOREIGN KEY (`borrower_id`) REFERENCES `loans_user` (`id`);

--
-- Constraints for table `loans_loan`
--
ALTER TABLE `loans_loan`
  ADD CONSTRAINT `loans_loan_borrower_id_482a8bc4_fk_loans_user_id` FOREIGN KEY (`borrower_id`) REFERENCES `loans_user` (`id`),
  ADD CONSTRAINT `loans_loan_loan_type_id_8782e997_fk_loans_loantype_id` FOREIGN KEY (`loan_type_id`) REFERENCES `loans_loantype` (`id`),
  ADD CONSTRAINT `loans_loan_reviewed_by_id_e42a366a_fk_loans_user_id` FOREIGN KEY (`reviewed_by_id`) REFERENCES `loans_user` (`id`);

--
-- Constraints for table `loans_notification`
--
ALTER TABLE `loans_notification`
  ADD CONSTRAINT `loans_notification_user_id_765b7830_fk_loans_user_id` FOREIGN KEY (`user_id`) REFERENCES `loans_user` (`id`);

--
-- Constraints for table `loans_payment`
--
ALTER TABLE `loans_payment`
  ADD CONSTRAINT `loans_payment_borrower_id_36c830af_fk_loans_user_id` FOREIGN KEY (`borrower_id`) REFERENCES `loans_user` (`id`),
  ADD CONSTRAINT `loans_payment_loan_id_9bc85efd_fk_loans_loan_id` FOREIGN KEY (`loan_id`) REFERENCES `loans_loan` (`id`),
  ADD CONSTRAINT `loans_payment_recorded_by_id_3a9baaee_fk_loans_user_id` FOREIGN KEY (`recorded_by_id`) REFERENCES `loans_user` (`id`);

--
-- Constraints for table `loans_user_groups`
--
ALTER TABLE `loans_user_groups`
  ADD CONSTRAINT `loans_user_groups_group_id_46e74626_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`),
  ADD CONSTRAINT `loans_user_groups_user_id_0b308894_fk_loans_user_id` FOREIGN KEY (`user_id`) REFERENCES `loans_user` (`id`);

--
-- Constraints for table `loans_user_user_permissions`
--
ALTER TABLE `loans_user_user_permissions`
  ADD CONSTRAINT `loans_user_user_perm_permission_id_3baf2529_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  ADD CONSTRAINT `loans_user_user_permissions_user_id_08ae1cf3_fk_loans_user_id` FOREIGN KEY (`user_id`) REFERENCES `loans_user` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
